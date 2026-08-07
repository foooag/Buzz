import { z } from "zod";
import type { AppError } from "@shared/ipc/result";
export type { CreateSshProfile } from "../ssh/sshTypes";

/**
 * Opaque identifier strings — mirror the Rust newtypes `SftpSessionId`,
 * `TransferId`, and `WatcherId` (all `#[serde(transparent)]` over a `String`).
 */
export type SftpSessionId = string;
export type TransferId = string;
export type WatcherId = string;

/**
 * Direction of a transfer batch. Mirrors `sftp::transfer::TransferDirection`,
 * which serializes as a camelCase scalar (`"upload"` / `"download"`).
 */
export type SftpDirection = "upload" | "download";

// ---------------------------------------------------------------------------
// Conflict + policy model. Mirrors `sftp::conflict` and `sftp::transfer`:
// both enums serialize with an explicit discriminant tag and camelCase variant
// names, so the Zod discriminated unions line up field-for-field.
// ---------------------------------------------------------------------------

export const conflictPolicySchema = z.enum(["ask", "overwrite", "skip", "rename"]);
export type ConflictPolicy = z.infer<typeof conflictPolicySchema>;

export const conflictKindSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("targetExists"), targetName: z.string() }),
  z.object({ kind: z.literal("remoteChanged"), remoteName: z.string() }),
]);
export type ConflictKind = z.infer<typeof conflictKindSchema>;

export const conflictResolutionSchema = z.discriminatedUnion("resolution", [
  z.object({ resolution: z.literal("overwrite") }),
  z.object({ resolution: z.literal("skip") }),
  z.object({ resolution: z.literal("rename"), newName: z.string() }),
  z.object({ resolution: z.literal("applyToAll"), applyToAll: conflictPolicySchema }),
]);
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;

export const resolveConflictInputSchema = z.object({
  transferId: z.string().min(1),
  itemId: z.string(),
  resolution: conflictResolutionSchema,
});
export type ResolveConflictInput = z.infer<typeof resolveConflictInputSchema>;

// ---------------------------------------------------------------------------
// Listing + association types. All mirror `#[serde(rename_all = "camelCase")]`
// Rust structs in `sftp::manager`, `sftp::local_fs`, `sftp::associations`.
// ---------------------------------------------------------------------------

export type RemoteEntry = {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
  permissions: number | null;
};

export type LocalEntry = {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
  permissions: number | null;
};

export type Association = {
  extension: string;
  appPath: string;
  appName: string;
  updatedAt: string;
};

export type TransferSummary = {
  succeeded: number;
  failed: number;
  skipped: number;
};

export type SftpAppError = AppError;

/**
 * The full event stream emitted by one SFTP session channel. The backend
 * serializes its `TerminalEvent` enum with a `"type"` discriminant and
 * camelCase fields; only the variants an SFTP session can emit are listed
 * here (connection lifecycle + transfer + open-with). Connection-lifecycle
 * variants reuse the same shape as `TerminalEvent` so the existing
 * `HostKeyDialog` can drive SFTP host-key prompts unchanged.
 */
export type SftpSessionEvent =
  // Connection lifecycle (shared with the terminal event stream).
  | { type: "connectionStateChanged"; sessionId: SftpSessionId; state: SftpConnectionState }
  | {
      type: "hostKeyVerificationRequired";
      sessionId: SftpSessionId;
      host: string;
      port: number;
      algorithm: string;
      fingerprint: string;
    }
  | { type: "error"; sessionId: SftpSessionId; error: SftpAppError }
  // Transfer queue.
  | {
      type: "sftpTransferQueued";
      sessionId: SftpSessionId;
      transferId: TransferId;
      direction: SftpDirection;
      itemCount: number;
    }
  | {
      type: "sftpTransferProgress";
      sessionId: SftpSessionId;
      transferId: TransferId;
      itemId: string;
      transferred: number;
      total: number;
    }
  | {
      type: "sftpTransferConflict";
      sessionId: SftpSessionId;
      transferId: TransferId;
      itemId: string;
      kind: ConflictKind;
    }
  | {
      type: "sftpTransferItemCompleted";
      sessionId: SftpSessionId;
      transferId: TransferId;
      itemId: string;
    }
  | {
      type: "sftpTransferItemFailed";
      sessionId: SftpSessionId;
      transferId: TransferId;
      itemId: string;
      code: string;
    }
  | {
      type: "sftpTransferCompleted";
      sessionId: SftpSessionId;
      transferId: TransferId;
      summary: TransferSummary;
    }
  // Open-With workflow.
  | {
      type: "sftpOpenWithLaunched";
      sessionId: SftpSessionId;
      watcherId: WatcherId;
      remoteName: string;
      needsAssociationPrompt: boolean;
    }
  | {
      type: "sftpOpenWithSaved";
      sessionId: SftpSessionId;
      watcherId: WatcherId;
      remoteName: string;
    }
  | {
      type: "sftpOpenWithConflict";
      sessionId: SftpSessionId;
      watcherId: WatcherId;
      kind: ConflictKind;
    }
  | { type: "sftpOpenWithClosed"; sessionId: SftpSessionId; watcherId: WatcherId };

export type SftpConnectionState =
  | "connecting"
  | "verifyingHostKey"
  | "authenticating"
  | "connected"
  | "disconnected"
  | "reconnecting";

const SFTP_CONNECTION_STATES: readonly SftpConnectionState[] = [
  "connecting",
  "verifyingHostKey",
  "authenticating",
  "connected",
  "disconnected",
  "reconnecting",
];

const SFTP_EVENT_TYPES = new Set<SftpSessionEvent["type"]>([
  "connectionStateChanged",
  "hostKeyVerificationRequired",
  "error",
  "sftpTransferQueued",
  "sftpTransferProgress",
  "sftpTransferConflict",
  "sftpTransferItemCompleted",
  "sftpTransferItemFailed",
  "sftpTransferCompleted",
  "sftpOpenWithLaunched",
  "sftpOpenWithSaved",
  "sftpOpenWithConflict",
  "sftpOpenWithClosed",
]);

/**
 * Type guard for `SftpSessionEvent`. Mirrors `isTerminalEvent`'s record +
 * switch style: it narrows on the `"type"` discriminant and validates the
 * payload so `callStreamingCommand`'s `onEvent` can safely fold validated
 * events into the store and drop anything malformed from the channel.
 */
export function isSftpSessionEvent(value: unknown): value is SftpSessionEvent {
  if (!isRecord(value)) return false;
  if (typeof value.type !== "string" || !SFTP_EVENT_TYPES.has(value.type as SftpSessionEvent["type"])) {
    return false;
  }
  if (!hasSessionId(value)) return false;

  switch (value.type) {
    case "connectionStateChanged":
      return (
        typeof value.state === "string" &&
        SFTP_CONNECTION_STATES.includes(value.state as SftpConnectionState)
      );
    case "hostKeyVerificationRequired":
      return (
        typeof value.host === "string" &&
        Number.isInteger(value.port) &&
        typeof value.algorithm === "string" &&
        typeof value.fingerprint === "string"
      );
    case "error":
      return (
        isRecord(value.error) &&
        typeof value.error.code === "string" &&
        value.error.code.length > 0 &&
        typeof value.error.message === "string"
      );
    case "sftpTransferQueued":
      return (
        typeof value.transferId === "string" &&
        (value.direction === "upload" || value.direction === "download") &&
        typeof value.itemCount === "number" &&
        Number.isInteger(value.itemCount) &&
        value.itemCount >= 0
      );
    case "sftpTransferProgress":
      return (
        typeof value.transferId === "string" &&
        typeof value.itemId === "string" &&
        typeof value.transferred === "number" &&
        typeof value.total === "number"
      );
    case "sftpTransferConflict":
      return (
        typeof value.transferId === "string" &&
        typeof value.itemId === "string" &&
        conflictKindSchema.safeParse(value.kind).success
      );
    case "sftpTransferItemCompleted":
      return typeof value.transferId === "string" && typeof value.itemId === "string";
    case "sftpTransferItemFailed":
      return (
        typeof value.transferId === "string" &&
        typeof value.itemId === "string" &&
        typeof value.code === "string"
      );
    case "sftpTransferCompleted":
      return (
        typeof value.transferId === "string" && isTransferSummary(value.summary)
      );
    case "sftpOpenWithLaunched":
      return (
        typeof value.watcherId === "string" &&
        typeof value.remoteName === "string" &&
        typeof value.needsAssociationPrompt === "boolean"
      );
    case "sftpOpenWithSaved":
      return (
        typeof value.watcherId === "string" && typeof value.remoteName === "string"
      );
    case "sftpOpenWithConflict":
      return (
        typeof value.watcherId === "string" &&
        conflictKindSchema.safeParse(value.kind).success
      );
    case "sftpOpenWithClosed":
      return typeof value.watcherId === "string";
    default:
      return false;
  }
}

function isTransferSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.succeeded === "number" &&
    typeof value.failed === "number" &&
    typeof value.skipped === "number"
  );
}

function hasSessionId(value: Record<string, unknown>): boolean {
  return typeof value.sessionId === "string" && value.sessionId.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
