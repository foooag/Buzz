import { parse } from "shell-quote";

export type RiskVerdict =
  | { kind: "allow" }
  | { kind: "needsConfirmation"; level: "high"; reason: string; projectedEffect: string }
  | { kind: "reject"; reason: string };

const INTERACTIVE = new Set([
  "vim", "vi", "nano", "emacs", "top", "htop", "less", "more", "man",
  "ssh", "telnet", "mysql", "psql", "redis-cli", "mongosh",
]);

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

function basename(value: string): string {
  return value.split("/").at(-1) ?? value;
}
