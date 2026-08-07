import { callCommand, callStreamingCommand } from "../../app/ipc";
import {
  isTerminalEvent,
  type OpenedTerminal,
  type SessionId,
  type TerminalEvent,
  type TerminalSize,
} from "./terminalTypes";

export type TerminalApi = {
  open: (
    size: TerminalSize,
    onEvent: (event: TerminalEvent) => void,
  ) => Promise<OpenedTerminal>;
  write: (sessionId: SessionId, data: Uint8Array) => Promise<void>;
  resize: (sessionId: SessionId, size: TerminalSize) => Promise<void>;
  close: (sessionId: SessionId) => Promise<void>;
};

export const terminalApi: TerminalApi = {
  open: (size, onEvent) =>
    callStreamingCommand<
      { size: TerminalSize },
      unknown,
      OpenedTerminal
    >("terminal_open", { size }, (event) => {
      if (isTerminalEvent(event)) onEvent(event);
    }),

  write: (sessionId, data) =>
    callCommand<{ sessionId: SessionId; data: number[] }, void>(
      "terminal_write",
      { sessionId, data: Array.from(data) },
    ),

  resize: (sessionId, size) =>
    callCommand<{ sessionId: SessionId; size: TerminalSize }, void>(
      "terminal_resize",
      { sessionId, size },
    ),

  close: (sessionId) =>
    callCommand<{ sessionId: SessionId }, void>("terminal_close", {
      sessionId,
    }),
};
