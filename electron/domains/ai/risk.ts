import { createHash, randomUUID } from "node:crypto";
import { parse } from "shell-quote";
import { DomainError } from "../../ipc/domain-error.js";

export type RiskVerdict =
  | { kind: "allow" }
  | { kind: "needsConfirmation"; level: "high"; reason: string; projectedEffect: string }
  | { kind: "reject"; reason: string };

export type ShellAssessment = {
  verdict: RiskVerdict;
  confirmationToken?: string;
  expiresInMs?: number;
};

type Confirmation = {
  taskId: string;
  sshSessionId: string;
  host: string;
  cwd: string;
  commandHash: string;
  expiresAt: number;
};

const TTL_MS = 60_000;
const INTERACTIVE = new Set([
  "vim", "vi", "nano", "emacs", "top", "htop", "less", "more", "man",
  "ssh", "telnet", "mysql", "psql", "redis-cli", "mongosh",
]);

export class AiShellRiskRuntime {
  readonly #confirmations = new Map<string, Confirmation>();

  assess(taskId: string, sshSessionId: string, host: string, cwd: string, command: string): ShellAssessment {
    validate(taskId, sshSessionId, cwd, command);
    const verdict = classify(command);
    if (verdict.kind !== "needsConfirmation") return { verdict };
    const token = randomUUID();
    const current = Date.now();
    for (const [key, value] of this.#confirmations) {
      if (value.expiresAt <= current) this.#confirmations.delete(key);
    }
    this.#confirmations.set(token, {
      taskId, sshSessionId, host, cwd, commandHash: hash(command), expiresAt: current + TTL_MS,
    });
    return { verdict, confirmationToken: token, expiresInMs: TTL_MS };
  }

  authorize(
    taskId: string,
    sshSessionId: string,
    host: string,
    cwd: string,
    command: string,
    token?: string,
  ): void {
    validate(taskId, sshSessionId, cwd, command);
    const verdict = classify(command);
    if (verdict.kind === "allow") return;
    if (verdict.kind === "reject") throw new DomainError("AI_SSH_REJECTED", verdict.reason);
    const saved = token ? this.#confirmations.get(token) : undefined;
    if (token) this.#confirmations.delete(token);
    if (!saved || saved.expiresAt <= Date.now() || saved.taskId !== taskId ||
      saved.sshSessionId !== sshSessionId || saved.host !== host || saved.cwd !== cwd ||
      saved.commandHash !== hash(command)) throw confirmationRequired();
  }

  discard(token: string): void {
    this.#confirmations.delete(token);
  }
}

export function classify(command: string): RiskVerdict {
  const raw = command.trim();
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(raw);
  } catch {
    return { kind: "reject", reason: "The command could not be parsed safely." };
  }
  const tokens = parsed.filter((value): value is string => typeof value === "string");
  if (!tokens.length || typeof parsed[0] !== "string") {
    return { kind: "reject", reason: "The command could not be parsed safely." };
  }
  const commandName = basename(tokens[0]);
  if (INTERACTIVE.has(commandName)) {
    return { kind: "reject", reason: `${commandName} is interactive and cannot run in the side channel.` };
  }
  const reason = denylist(tokens, raw);
  return reason
    ? { kind: "needsConfirmation", level: "high", reason, projectedEffect: "" }
    : { kind: "allow" };
}

function denylist(tokens: string[], raw: string): string | undefined {
  const command = basename(tokens[0]);
  if (command === "rm") {
    const recursive = tokens.some((token) => token === "-r" || token === "-R" ||
      token === "--recursive" || (/^-[^-]/.test(token) && token.toLowerCase().includes("r")));
    const force = tokens.some((token) => token === "-f" || token === "--force" ||
      (/^-[^-]/.test(token) && token.toLowerCase().includes("f")));
    if (recursive && force || tokens.some((token) => token === "--no-preserve-root" ||
      token === "/" || token === "/*")) {
      return "rm removes files recursively/forcibly, without preserve-root, or targets root.";
    }
  }
  if (["dd", "mkfs", "fdisk", "shred"].includes(command)) {
    return `${command} writes destructively to a device or file.`;
  }
  if (command === "sudo" || command === "su") return "Privilege escalation requires confirmation.";
  if ((command === "chmod" || command === "chown") &&
    tokens.some((token) => token === "-R" || token === "--recursive")) {
    return `${command} -R recursively changes permissions or ownership.`;
  }
  if (["shutdown", "reboot", "halt", "poweroff"].includes(command)) {
    return `${command} changes the machine power state.`;
  }
  if (command === "npm" && tokens.includes("publish")) return "npm publish releases a package publicly.";
  if (command === "git" && tokens.includes("push") &&
    tokens.some((token) => token === "--force" || token === "-f")) {
    return "git push --force rewrites shared history.";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("| sh") || lower.includes("| bash") || lower.includes("| python")) {
    return "Piping command output into a shell.";
  }
  if (lower.includes(">/dev/sd") || lower.includes(">/dev/disk")) {
    return "Redirecting output to a block device.";
  }
  const upper = raw.toUpperCase();
  if (upper.includes("DROP ") || upper.includes("TRUNCATE ")) {
    return "SQL DROP or TRUNCATE destroys data.";
  }
  return undefined;
}

function validate(taskId: string, sshSessionId: string, cwd: string, command: string): void {
  if (!taskId.trim() || !sshSessionId.trim() || !cwd.trim() || !command.trim()) {
    throw new DomainError(
      "AI_SSH_INVALID_COMMAND",
      "Task, SSH session, remote CWD, and command are required.",
    );
  }
}

function basename(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function confirmationRequired(): DomainError {
  return new DomainError(
    "AI_SSH_CONFIRMATION_REQUIRED",
    "This command requires a current, matching confirmation.",
  );
}
