import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success, type IpcResult } from "../../../shared/ipc/result.js";
import { TerminalRuntime } from "./runtime.js";

export type RoutedTerminalRuntime = {
  has(sessionId: string): boolean;
  write(sessionId: string, data: readonly number[]): void | Promise<void>;
  resize(sessionId: string, size: { cols: number; rows: number }): void | Promise<void>;
  close(sessionId: string): void | Promise<void>;
};

const size = z.object({
  cols: z.number().int().min(0).max(65_535),
  rows: z.number().int().min(0).max(65_535),
});
const session = z.object({ sessionId: z.string() });

export function createTerminalCommandHandlers(
  runtime: TerminalRuntime,
  remote?: RoutedTerminalRuntime,
): CommandHandlers {
  return {
    terminal_open: command(
      z.object({ size }),
      ({ size: terminalSize }, context) => runtime.open(terminalSize, context.streamId),
    ),
    terminal_write: command(
      z.object({
        sessionId: z.string(),
        data: z.array(z.number().int().min(0).max(255)),
      }),
      ({ sessionId, data }, context) => {
        if (runtime.has(sessionId)) return runtime.write(sessionId, data);
        if (remote?.has(sessionId)) return remote.write(sessionId, data);
        return context.fallback();
      },
    ),
    terminal_resize: command(
      z.object({ sessionId: z.string(), size }),
      ({ sessionId, size: terminalSize }, context) => {
        if (runtime.has(sessionId)) return runtime.resize(sessionId, terminalSize);
        if (remote?.has(sessionId)) return remote.resize(sessionId, terminalSize);
        return context.fallback();
      },
    ),
    terminal_close: command(session, ({ sessionId }, context) => {
      if (runtime.has(sessionId)) return runtime.close(sessionId);
      if (remote?.has(sessionId)) return remote.close(sessionId);
      return context.fallback();
    }),
  };
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input, context: CommandContext) => Output,
): CommandHandler {
  return async (rawInput, context) => {
    try {
      const input = schema.parse(rawInput);
      const output = await operation(input, context);
      return isIpcResult(output) ? output : success(output);
    } catch (error) {
      if (error instanceof DomainError) return error.toResult();
      if (error instanceof ZodError) {
        return failure(
          "IPC_INVALID_INPUT",
          "The desktop operation received invalid input.",
        );
      }
      throw error;
    }
  };
}

function isIpcResult(value: unknown): value is IpcResult<unknown> {
  return typeof value === "object" && value !== null && "ok" in value;
}
