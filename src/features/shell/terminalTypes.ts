import type { AppError } from "../../shared/result";

export type SessionId = string;
export type PaneId = string;

export type PaneNode = {
  type: "pane";
  paneId: PaneId;
  sessionId: SessionId;
};

export type SplitNode =
  | PaneNode
  | {
      type: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export type TerminalSize = { cols: number; rows: number };

export type OpenedTerminal = {
  sessionId: SessionId;
  title: string;
};

export type TerminalEvent =
  | { type: "output"; sessionId: SessionId; data: number[] }
  | { type: "title"; sessionId: SessionId; title: string }
  | { type: "exit"; sessionId: SessionId; exitCode: number | null }
  | { type: "error"; sessionId: SessionId; error: AppError }
  | {
      type: "hostKeyVerificationRequired";
      sessionId: SessionId;
      host: string;
      port: number;
      algorithm: string;
      fingerprint: string;
    }
  | {
      type: "connectionStateChanged";
      sessionId: SessionId;
      state: "connecting" | "verifyingHostKey" | "authenticating" | "connected" | "disconnected" | "reconnecting";
    }
  | { type: "reconnectAvailable"; sessionId: SessionId };

export function isTerminalEvent(value: unknown): value is TerminalEvent {
  if (!isRecord(value) || !hasSessionId(value)) return false;

  switch (value.type) {
    case "output":
      return (
        Array.isArray(value.data) &&
        value.data.every(
          (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
        )
      );
    case "title":
      return typeof value.title === "string";
    case "exit":
      return (
        value.exitCode === null ||
        (typeof value.exitCode === "number" &&
          Number.isInteger(value.exitCode) &&
          value.exitCode >= 0)
      );
    case "error":
      return (
        isRecord(value.error) &&
        typeof value.error.code === "string" &&
        value.error.code.length > 0 &&
        typeof value.error.message === "string"
      );
    case "hostKeyVerificationRequired":
      return (
        typeof value.host === "string" &&
        Number.isInteger(value.port) &&
        typeof value.algorithm === "string" &&
        typeof value.fingerprint === "string"
      );
    case "connectionStateChanged":
      return (
        typeof value.state === "string" &&
        ["connecting", "verifyingHostKey", "authenticating", "connected", "disconnected", "reconnecting"].includes(value.state)
      );
    case "reconnectAvailable":
      return true;
    default:
      return false;
  }
}

function hasSessionId(value: Record<string, unknown>) {
  return typeof value.sessionId === "string" && value.sessionId.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
