import { failure, type IpcResult } from "../../shared/ipc/result.js";

export class DomainError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }

  toResult(): IpcResult<never> {
    return failure(this.code, this.message, this.details);
  }
}
