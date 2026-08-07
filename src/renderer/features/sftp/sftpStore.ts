import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { SftpApi } from "./sftpApi";
import type {
  ConflictKind,
  ConflictResolution,
  CreateSshProfile,
  LocalEntry,
  RemoteEntry,
  SftpDirection,
  SftpSessionEvent,
  SftpSessionId,
  TransferId,
  WatcherId,
} from "./sftpTypes";

/**
 * One SFTP session the store is tracking. `remoteCwd` is the path the remote
 * pane is currently listing; `connected` mirrors the last
 * `connectionStateChanged` event so the panel can reflect disconnects.
 */
export type SftpSession = {
  sessionId: SftpSessionId;
  connected: boolean;
  remoteCwd: string;
};

/**
 * Live view of one transfer batch, folded from `SftpSessionEvent`s.
 */
export type TransferItemView = {
  itemId: string;
  transferred: number;
  total: number;
  status: "active" | "done" | "failed" | "conflict";
  code?: string;
};

export type TransferView = {
  transferId: TransferId;
  sessionId: SftpSessionId;
  direction: SftpDirection;
  itemCount: number;
  items: Record<string, TransferItemView>;
  summary?: { succeeded: number; failed: number; skipped: number };
};

export type ActiveConflict = {
  sessionId: SftpSessionId;
  transferId: TransferId;
  itemId: string;
  kind: ConflictKind;
};

export type WatcherView = {
  watcherId: WatcherId;
  remoteName: string;
  status: "launched" | "saved" | "conflict" | "closed";
  needsAssociationPrompt: boolean;
};

export type ActiveOpenWithConflict = {
  watcherId: WatcherId;
  remoteName: string;
  kind: ConflictKind;
};

export type SftpStoreState = {
  sessions: Record<SftpSessionId, SftpSession>;
  localCwd: string;
  remoteCwds: Record<SftpSessionId, string>;
  localEntries: LocalEntry[];
  remoteEntriesBySession: Record<SftpSessionId, RemoteEntry[]>;
  showHidden: boolean;
  transfers: TransferView[];
  activeConflict: ActiveConflict | null;
  watchers: Record<WatcherId, WatcherView>;
  activeOpenWithConflict: ActiveOpenWithConflict | null;
  error: string | null;

  open(profile: CreateSshProfile, observer?: SftpEventObserver): Promise<SftpSessionId>;
  setShowHidden(showHidden: boolean): void;
  refreshRemote(sessionId: SftpSessionId, path: string): Promise<void>;
  refreshLocal(path: string): Promise<void>;
  enqueueUpload(
    sessionId: SftpSessionId,
    items: string[],
    remoteDir: string,
  ): Promise<TransferId>;
  enqueueDownload(
    sessionId: SftpSessionId,
    items: string[],
    localDir: string,
  ): Promise<TransferId>;
  resolveConflict(resolution: ConflictResolution): Promise<void>;
  resolveOpenWithConflict(resolution: ConflictResolution): Promise<void>;
  closeOpenWith(watcherId: WatcherId): Promise<void>;
  clearError(): void;
  ingest(event: SftpSessionEvent): void;
  close(sessionId: SftpSessionId): Promise<void>;
};

export type SftpEventObserver = (event: SftpSessionEvent) => void;

/**
 * Zustand store factory. The `SftpApi` is dependency-injected so tests pass
 * `createDeterministicSftpApi()` while production wires `sftpApi`.
 * Remote entries and CWDs are tracked per-session. The panel owns pane
 * source selection as local React state.
 */
export function createSftpStore(
  api: SftpApi,
): UseBoundStore<StoreApi<SftpStoreState>> {
  return create<SftpStoreState>((set, get) => ({
    sessions: {},
    localCwd: "/",
    remoteCwds: {},
    localEntries: [],
    remoteEntriesBySession: {},
    showHidden: false,
    transfers: [],
    activeConflict: null,
    watchers: {},
    activeOpenWithConflict: null,
    error: null,

    async open(profile, observer) {
      const sessionId = await api.open(profile, (event) => {
        get().ingest(event);
        observer?.(event);
      });
      set((state) => ({
        sessions: {
          ...state.sessions,
          [sessionId]: { sessionId, connected: true, remoteCwd: "/" },
        },
        remoteCwds: { ...state.remoteCwds, [sessionId]: "/" },
        error: null,
      }));
      return sessionId;
    },

    setShowHidden(showHidden) {
      set({ showHidden });
    },

    async refreshRemote(sessionId, path) {
      try {
        const entries = await api.listRemote(sessionId, path, get().showHidden);
        set((state) => ({
          remoteEntriesBySession: {
            ...state.remoteEntriesBySession,
            [sessionId]: entries,
          },
          remoteCwds: { ...state.remoteCwds, [sessionId]: path },
          sessions: state.sessions[sessionId]
            ? {
                ...state.sessions,
                [sessionId]: { ...state.sessions[sessionId], remoteCwd: path },
              }
            : state.sessions,
        }));
      } catch {
        set({ error: "The remote directory could not be read." });
      }
    },

    async refreshLocal(path) {
      try {
        const entries = await api.listLocal(path, get().showHidden);
        set({ localEntries: entries, localCwd: path });
      } catch {
        set({ error: "The local directory could not be read." });
      }
    },

    async enqueueUpload(sessionId, items, remoteDir) {
      return api.enqueueUpload(sessionId, items, remoteDir, "ask");
    },

    async enqueueDownload(sessionId, items, localDir) {
      return api.enqueueDownload(sessionId, items, localDir, "ask");
    },

    async resolveConflict(resolution) {
      const conflict = get().activeConflict;
      if (!conflict) return;
      set({ activeConflict: null });
      await api.resolveConflict(conflict.transferId, conflict.itemId, resolution);
    },

    async resolveOpenWithConflict(resolution) {
      const conflict = get().activeOpenWithConflict;
      if (!conflict) return;
      set({ activeOpenWithConflict: null });
      await api.resolveOpenWithConflict(conflict.watcherId, resolution);
    },

    async closeOpenWith(watcherId) {
      await api.closeOpenWith(watcherId);
    },

    clearError() {
      set({ error: null });
    },

    ingest(event) {
      switch (event.type) {
        case "connectionStateChanged":
          set((state) => {
            const session = state.sessions[event.sessionId];
            if (!session) return state;
            return {
              sessions: {
                ...state.sessions,
                [event.sessionId]: {
                  ...session,
                  connected: event.state === "connected" || event.state === "reconnecting",
                },
              },
            };
          });
          return;
        case "error":
          set((state) => {
            if (!state.sessions[event.sessionId]) return state;
            return {
              error: event.error.message,
              sessions: {
                ...state.sessions,
                [event.sessionId]: {
                  ...state.sessions[event.sessionId],
                  connected: false,
                },
              },
            };
          });
          return;
        case "sftpTransferQueued":
          set((state) => ({
            transfers: [
              ...state.transfers,
              {
                transferId: event.transferId,
                sessionId: event.sessionId,
                direction: event.direction,
                itemCount: event.itemCount,
                items: {},
              },
            ],
          }));
          return;
        case "sftpTransferProgress":
          set((state) => ({
            transfers: updateItem(state.transfers, event.transferId, event.itemId, (item) => ({
              ...item,
              transferred: event.transferred,
              total: event.total,
              status: "active",
            })),
          }));
          return;
        case "sftpTransferItemCompleted":
          set((state) => ({
            transfers: updateItem(state.transfers, event.transferId, event.itemId, (item) => ({
              ...item,
              transferred: item.total || item.transferred,
              status: "done",
            })),
          }));
          return;
        case "sftpTransferItemFailed":
          set((state) => ({
            transfers: updateItem(state.transfers, event.transferId, event.itemId, (item) => ({
              ...item,
              status: "failed",
              code: event.code,
            })),
          }));
          return;
        case "sftpTransferConflict":
          set((state) => ({
            transfers: updateItem(state.transfers, event.transferId, event.itemId, (item) => ({
              ...item,
              status: "conflict",
            })),
            activeConflict: {
              sessionId: event.sessionId,
              transferId: event.transferId,
              itemId: event.itemId,
              kind: event.kind,
            },
          }));
          return;
        case "sftpTransferCompleted":
          set((state) => ({
            transfers: state.transfers.map((transfer) =>
              transfer.transferId === event.transferId
                ? { ...transfer, summary: event.summary }
                : transfer,
            ),
          }));
          return;
        case "sftpOpenWithLaunched":
          set((state) => ({
            watchers: upsertWatcher(state.watchers, event.watcherId, {
              watcherId: event.watcherId,
              remoteName: event.remoteName,
              status: "launched",
              needsAssociationPrompt: event.needsAssociationPrompt,
            }),
          }));
          return;
        case "sftpOpenWithSaved": {
          const existing = get().watchers[event.watcherId];
          set((state) => ({
            watchers: upsertWatcher(state.watchers, event.watcherId, {
              watcherId: event.watcherId,
              remoteName: event.remoteName,
              status: "saved",
              needsAssociationPrompt: existing?.needsAssociationPrompt ?? false,
            }),
          }));
          return;
        }
        case "sftpOpenWithConflict": {
          const prev = get().watchers[event.watcherId];
          set((state) => ({
            watchers: upsertWatcher(state.watchers, event.watcherId, {
              watcherId: event.watcherId,
              remoteName: prev?.remoteName ?? "",
              status: "conflict",
              needsAssociationPrompt: prev?.needsAssociationPrompt ?? false,
            }),
            activeOpenWithConflict: {
              watcherId: event.watcherId,
              remoteName: prev?.remoteName ?? "",
              kind: event.kind,
            },
          }));
          return;
        }
        case "sftpOpenWithClosed": {
          const closed = get().watchers[event.watcherId];
          set((state) => ({
            watchers: upsertWatcher(state.watchers, event.watcherId, {
              watcherId: event.watcherId,
              remoteName: closed?.remoteName ?? "",
              status: "closed",
              needsAssociationPrompt: closed?.needsAssociationPrompt ?? false,
            }),
          }));
          return;
        }
        case "hostKeyVerificationRequired":
          return;
        default:
          return;
      }
    },

    async close(sessionId) {
      await api.close(sessionId);
      set((state) => {
        const sessions = { ...state.sessions };
        delete sessions[sessionId];
        const remoteCwds = { ...state.remoteCwds };
        delete remoteCwds[sessionId];
        const remoteEntriesBySession = { ...state.remoteEntriesBySession };
        delete remoteEntriesBySession[sessionId];

        return {
          sessions,
          remoteCwds,
          remoteEntriesBySession,
        };
      });
    },
  }));
}

function updateItem(
  transfers: TransferView[],
  transferId: TransferId,
  itemId: string,
  update: (item: TransferItemView) => TransferItemView,
): TransferView[] {
  return transfers.map((transfer) => {
    if (transfer.transferId !== transferId) return transfer;
    const existing = transfer.items[itemId] ?? {
      itemId,
      transferred: 0,
      total: 0,
      status: "active" as const,
    };
    return {
      ...transfer,
      items: { ...transfer.items, [itemId]: update(existing) },
    };
  });
}

function upsertWatcher(
  watchers: Record<WatcherId, WatcherView>,
  watcherId: WatcherId,
  next: WatcherView,
): Record<WatcherId, WatcherView> {
  return { ...watchers, [watcherId]: next };
}
