import type { SftpApi } from "./sftpApi";
import type {
  Association,
  ConflictPolicy,
  CreateSshProfile,
  LocalEntry,
  RemoteEntry,
  SftpDirection,
  SftpSessionEvent,
  SftpSessionId,
  TransferId,
  TransferSummary,
  WatcherId,
} from "./sftpTypes";

/**
 * Scripted, in-memory `SftpApi` for Vitest + Playwright. Mirrors
 * `createDeterministicSshApi`: no native IPC surface, synthetic data
 * only. `open` emits `hostKeyVerificationRequired` and resolves once
 * `decideHostKey(true)` is called (matching the real backend flow). `listRemote`
 * returns seeded entries; `enqueueUpload`/`enqueueDownload` emit
 * `sftpTransferQueued` then `sftpTransferCompleted` after a short tick so the
 * store's event ingest can be exercised end to end.
 *
 * The factory returns the api plus a small control surface (`reset`, `seed`)
 * so tests can prime the remote listing and isolate state.
 */
export type DeterministicSftpApi = SftpApi & {
  /** Clear all seeded listings, associations, and pending sessions. */
  reset(): void;
  /** Replace the synthetic remote listing for a given path. */
  seedRemote(path: string, entries: RemoteEntry[]): void;
  /** Replace the synthetic local listing for a given path. */
  seedLocal(path: string, entries: LocalEntry[]): void;
};

export function createDeterministicSftpApi(): DeterministicSftpApi {
  let nextSession = 1;
  let nextTransfer = 1;
  let nextWatcher = 1;
  const remoteListings = new Map<string, RemoteEntry[]>();
  const localListings = new Map<string, LocalEntry[]>();
  const associations = new Map<string, Association>();
  const pending = new Map<
    SftpSessionId,
    {
      onEvent: (event: SftpSessionEvent) => void;
      resolve: (sessionId: SftpSessionId) => void;
      reject: (error: Error) => void;
    }
  >();
  /**
   * Per-session event sink that survives the host-key handshake. Transfer and
   * open-with events route through here so the store's `onEvent -> ingest`
   * flow keeps working after `decideHostKey` resolves the session.
   */
  const sinks = new Map<SftpSessionId, (event: SftpSessionEvent) => void>();

  function defaultRemote(): RemoteEntry[] {
    return [
      { name: "documents", isDir: true, size: 0, modified: null, permissions: null },
      { name: "readme.md", isDir: false, size: 128, modified: null, permissions: null },
    ];
  }

  function defaultLocal(): LocalEntry[] {
    return [
      { name: "Desktop", isDir: true, size: 0, modified: null, permissions: null },
      { name: "notes.txt", isDir: false, size: 64, modified: null, permissions: null },
    ];
  }

  return {
    open(profile: CreateSshProfile, onEvent) {
      const sessionId = `deterministic-sftp-${nextSession++}`;
      sinks.set(sessionId, onEvent);
      return new Promise<SftpSessionId>((resolve, reject) => {
        pending.set(sessionId, { onEvent, resolve, reject });
        onEvent({
          type: "connectionStateChanged",
          sessionId,
          state: "connecting",
        });
        onEvent({
          type: "hostKeyVerificationRequired",
          sessionId,
          host: profile.hostname,
          port: profile.port ?? 22,
          algorithm: "ssh-ed25519",
          fingerprint: "SHA256:synthetic",
        });
      });
    },

    async decideHostKey(sessionId, trust) {
      const connection = pending.get(sessionId);
      if (!connection) return;
      pending.delete(sessionId);
      if (!trust) {
        sinks.delete(sessionId);
        connection.reject(new Error("synthetic rejection"));
        return;
      }
      connection.onEvent({
        type: "connectionStateChanged",
        sessionId,
        state: "connected",
      });
      connection.resolve(sessionId);
    },

    async reconnect(sessionId) {
      return `deterministic-sftp-${nextSession++}`;
    },

    async listRemote(_sessionId, path, _showHidden) {
      return (remoteListings.get(path) ?? defaultRemote()).map((entry) => ({ ...entry }));
    },

    async listLocal(path, _showHidden) {
      return (localListings.get(path) ?? defaultLocal()).map((entry) => ({ ...entry }));
    },

    enqueueUpload(sessionId, items, _remoteDir, _policy) {
      const transferId: TransferId = `deterministic-transfer-${nextTransfer++}`;
      return runSyntheticTransfer(sessionId, transferId, "upload", items.length, sinks.get(sessionId));
    },

    enqueueDownload(sessionId, items, _localDir, _policy) {
      const transferId: TransferId = `deterministic-transfer-${nextTransfer++}`;
      return runSyntheticTransfer(sessionId, transferId, "download", items.length, sinks.get(sessionId));
    },

    async resolveConflict(_transferId, _itemId, _resolution) {
      /* deterministic transport resolves immediately; no-op */
    },

    async cancelTransfer(_transferId) {
      /* no-op */
    },

    async deleteRemote(_sessionId, _path) {
      /* no-op */
    },

    async renameRemote(_sessionId, _oldPath, _newPath) {
      /* no-op */
    },

    async mkdirRemote(_sessionId, _path) {
      /* no-op */
    },

    async openWith(sessionId, remotePath, _application) {
      const watcherId: WatcherId = `deterministic-watcher-${nextWatcher++}`;
      const sink = sinks.get(sessionId);
      sink?.({
        type: "sftpOpenWithLaunched",
        sessionId,
        watcherId,
        remoteName: remotePath.split("/").pop() ?? remotePath,
        needsAssociationPrompt: false,
      });
      return watcherId;
    },

    async resolveOpenWithConflict(_watcherId, _resolution) {
      /* no-op */
    },

    async closeOpenWith(sessionId) {
      /* no-op for determinism; a real session would emit sftpOpenWithClosed */
    },

    async listAssociations() {
      return Array.from(associations.values());
    },

    async setAssociation(extension, appPath, appName) {
      associations.set(extension, {
        extension,
        appPath,
        appName,
        updatedAt: "2026-07-15T00:00:00Z",
      });
    },

    async deleteAssociation(extension) {
      associations.delete(extension);
    },

    async close(sessionId) {
      sinks.delete(sessionId);
    },

    reset() {
      nextSession = 1;
      nextTransfer = 1;
      nextWatcher = 1;
      remoteListings.clear();
      localListings.clear();
      associations.clear();
      pending.clear();
      sinks.clear();
    },

    seedRemote(path, entries) {
      remoteListings.set(path, entries);
    },

    seedLocal(path, entries) {
      localListings.set(path, entries);
    },
  };
}

function runSyntheticTransfer(
  sessionId: SftpSessionId,
  transferId: TransferId,
  direction: SftpDirection,
  itemCount: number,
  sink: ((event: SftpSessionEvent) => void) | undefined,
): Promise<TransferId> {
  const summary: TransferSummary = { succeeded: itemCount, failed: 0, skipped: 0 };
  sink?.({
    type: "sftpTransferQueued",
    sessionId,
    transferId,
    direction,
    itemCount,
  });
  setTimeout(() => {
    sink?.({
      type: "sftpTransferCompleted",
      sessionId,
      transferId,
      summary,
    });
  }, 10);
  return Promise.resolve(transferId);
}
