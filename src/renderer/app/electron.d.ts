import type { IpcResult } from "@shared/ipc/result";
import type {
  AgentStreamEvent,
  AgentStreamRequest,
} from "@shared/agent-stream";

export type ElectronUpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | {
      event: "Progress";
      data: { chunkLength: number; contentLength?: number };
    }
  | { event: "Finished"; data?: undefined };

export type ElectronUpdateMetadata = {
  version: string;
  date?: string;
  body?: string;
};

export type TerminusDesktopBridge = {
  invoke: <T>(command: string, input: unknown) => Promise<IpcResult<T>>;
  stream: <TEvent, T>(
    command: string,
    input: unknown,
    onEvent: (event: TEvent) => void,
  ) => Promise<IpcResult<T>>;
  finiteStream: <TEvent, T>(
    command: string,
    input: unknown,
    onEvent: (event: TEvent) => void,
  ) => Promise<IpcResult<T>>;
  streamAgent: (
    request: AgentStreamRequest,
    onEvent: (event: AgentStreamEvent) => void,
    onClose?: () => void,
  ) => () => void;
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
  };
  updater: {
    check: () => Promise<ElectronUpdateMetadata | null>;
    close: () => Promise<void>;
    downloadAndInstall: (
      onEvent: (event: ElectronUpdateDownloadEvent) => void,
    ) => Promise<void>;
    relaunch: () => Promise<void>;
  };
};

declare global {
  interface Window {
    terminus?: TerminusDesktopBridge;
  }
}

export {};
