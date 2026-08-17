import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "../../ipc/domain-error.js";
import { classify, type RiskVerdict } from "../../../shared/shell-risk.js";

export { classify } from "../../../shared/shell-risk.js";
export type { RiskVerdict } from "../../../shared/shell-risk.js";

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

function validate(taskId: string, sshSessionId: string, cwd: string, command: string): void {
  if (!taskId.trim() || !sshSessionId.trim() || !cwd.trim() || !command.trim()) {
    throw new DomainError(
      "AI_SSH_INVALID_COMMAND",
      "Task, SSH session, remote CWD, and command are required.",
    );
  }
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
