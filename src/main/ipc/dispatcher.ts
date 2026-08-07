import type { CommandName } from "../../shared/ipc/command-names.js";
import { failure, type IpcResult } from "../../shared/ipc/result.js";

export type CommandContext = {
  streamId?: string;
  ownerId: string;
  fallback: () => Promise<IpcResult<unknown>>;
};

export type CommandHandler = (
  input: unknown,
  context: CommandContext,
) => IpcResult<unknown> | Promise<IpcResult<unknown>>;

export type LegacyCommandTransport = (
  command: CommandName,
  input: unknown,
  streamId?: string,
) => Promise<IpcResult<unknown>>;

export type CommandHandlers = Partial<Record<CommandName, CommandHandler>>;

export class CommandDispatcher {
  readonly #handlers: CommandHandlers;
  readonly #legacyTransport: LegacyCommandTransport;

  constructor(handlers: CommandHandlers, legacyTransport: LegacyCommandTransport) {
    this.#handlers = handlers;
    this.#legacyTransport = legacyTransport;
  }

  async invoke(
    command: CommandName,
    input: unknown,
    streamId?: string,
    ownerId = "unknown",
  ): Promise<IpcResult<unknown>> {
    const handler = this.#handlers[command];
    if (!handler) return this.#legacyTransport(command, input, streamId);

    try {
      return await handler(input, {
        streamId,
        ownerId,
        fallback: () => this.#legacyTransport(command, input, streamId),
      });
    } catch {
      return failure(
        "IPC_ELECTRON_ERROR",
        "The desktop service could not complete the operation.",
      );
    }
  }
}
