import type { AppError, IpcResult } from "@shared/ipc/result";

export type InvokeTransport = <T>(
  command: string,
  args: Record<string, unknown>,
) => Promise<IpcResult<T>>;

export type ChannelLike<T> = {
  onmessage: (message: T) => void;
};

export type ChannelFactory = () => ChannelLike<unknown>;

const defaultChannelFactory: ChannelFactory = () => ({
  onmessage: (_message: unknown) => undefined,
});

const electronInvokeTransport: InvokeTransport = async <T,>(
  command: string,
  args: Record<string, unknown>,
) => requireDesktopBridge().invoke<T>(command, args.input);

export class IpcCommandError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(error: AppError) {
    super(error.message);
    this.name = "IpcCommandError";
    this.code = error.code;
    this.details = error.details;
  }
}

export async function callCommand<TInput, TOutput>(
  command: string,
  input: TInput,
  transport: InvokeTransport = electronInvokeTransport,
): Promise<TOutput> {
  return invokeAndUnwrap<TOutput>(transport, command, { input });
}

export async function callStreamingCommand<TInput, TEvent, TOutput>(
  command: string,
  input: TInput,
  onEvent: (event: TEvent) => void,
  transport?: InvokeTransport,
  channelFactory: ChannelFactory = defaultChannelFactory,
): Promise<TOutput> {
  if (!transport) {
    let result: IpcResult<TOutput>;
    try {
      result = await requireDesktopBridge().stream<TEvent, TOutput>(
        command,
        input,
        onEvent,
      );
    } catch (rawError) {
      return sanitizeTransportFailure(command, rawError);
    }
    return unwrapResult(result);
  }

  const channel = channelFactory() as ChannelLike<TEvent>;
  channel.onmessage = onEvent;

  return invokeAndUnwrap<TOutput>(transport, command, {
    input,
    onEvent: channel,
  });
}

export async function callFiniteStreamingCommand<TInput, TEvent, TOutput>(
  command: string,
  input: TInput,
  onEvent: (event: TEvent) => void,
): Promise<TOutput> {
  let result: IpcResult<TOutput>;
  try {
    result = await requireDesktopBridge().finiteStream<TEvent, TOutput>(
      command,
      input,
      onEvent,
    );
  } catch (rawError) {
    return sanitizeTransportFailure(command, rawError);
  }
  return unwrapResult(result);
}

async function invokeAndUnwrap<TOutput>(
  transport: InvokeTransport,
  command: string,
  args: Record<string, unknown>,
): Promise<TOutput> {
  let result: IpcResult<TOutput>;

  try {
    result = await transport<TOutput>(command, args);
  } catch (rawError) {
    return sanitizeTransportFailure(command, rawError);
  }

  return unwrapResult(result);
}

function unwrapResult<TOutput>(result: IpcResult<TOutput>): TOutput {
  if (!result.ok) {
    throw new IpcCommandError(result.error);
  }

  return result.data;
}

function sanitizeTransportFailure(command: string, _rawError: unknown): never {
  // Native failures can contain paths, stack fragments, prompts, or secrets.
  // Only the command name is safe enough for renderer diagnostics.
  console.error(`[ipc] transport failed for "${command}"`);
  throw new IpcCommandError({
    code: "IPC_TRANSPORT_ERROR",
    message: "The desktop service could not be reached.",
  });
}

function requireDesktopBridge() {
  if (!window.terminus) {
    throw new Error("The Electron preload bridge is unavailable.");
  }
  return window.terminus;
}

export async function minimizeWindow(): Promise<void> {
  await requireDesktopBridge().window.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await requireDesktopBridge().window.toggleMaximize();
}

export type UpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: undefined };

export type AvailableUpdate = {
  version: string;
  date?: string;
  body?: string;
  close: () => Promise<void>;
  downloadAndInstall: (
    onEvent: (event: UpdateDownloadEvent) => void,
  ) => Promise<void>;
};

export function isRunningInElectron(): boolean {
  return Boolean(window.terminus);
}

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!window.terminus) return null;
  const update = await window.terminus.updater.check();
  if (!update) return null;
  return {
    version: update.version,
    date: update.date,
    body: update.body,
    close: () => requireDesktopBridge().updater.close(),
    downloadAndInstall: (onEvent) =>
      requireDesktopBridge().updater.downloadAndInstall(onEvent),
  };
}

export async function relaunchApp(): Promise<void> {
  await requireDesktopBridge().updater.relaunch();
}
