import { callCommand, callStreamingCommand } from "../../app/ipc";
import type { CreateSshProfile } from "../ssh/sshTypes";
import {
  isSftpSessionEvent,
  type Association,
  type ConflictPolicy,
  type ConflictResolution,
  type LocalEntry,
  type RemoteEntry,
  type SftpDirection,
  type SftpSessionEvent,
  type SftpSessionId,
  type TransferId,
  type WatcherId,
} from "./sftpTypes";

/**
 * One typed method per SFTP IPC command. Shapes mirror
 * native SFTP command input structs (all camelCase) and the
 * `CommandResponse<T>` payloads they return. `open` is the only streaming
 * command: it subscribes to the session event channel and resolves to the
 * assigned `SftpSessionId` once the session is established. The guard
 * (`isSftpSessionEvent`) drops malformed channel messages so the store only
 * folds validated events.
 */
export type SftpApi = {
  open(
    profile: CreateSshProfile,
    onEvent: (event: SftpSessionEvent) => void,
  ): Promise<SftpSessionId>;
  decideHostKey(sessionId: SftpSessionId, trust: boolean): Promise<void>;
  reconnect(sessionId: SftpSessionId): Promise<SftpSessionId>;
  listRemote(sessionId: SftpSessionId, path: string, showHidden: boolean): Promise<RemoteEntry[]>;
  listLocal(path: string, showHidden: boolean): Promise<LocalEntry[]>;
  enqueueUpload(
    sessionId: SftpSessionId,
    items: string[],
    remoteDir: string,
    policy: ConflictPolicy,
  ): Promise<TransferId>;
  enqueueDownload(
    sessionId: SftpSessionId,
    items: string[],
    localDir: string,
    policy: ConflictPolicy,
  ): Promise<TransferId>;
  resolveConflict(
    transferId: TransferId,
    itemId: string,
    resolution: ConflictResolution,
  ): Promise<void>;
  cancelTransfer(transferId: TransferId): Promise<void>;
  deleteRemote(sessionId: SftpSessionId, path: string): Promise<void>;
  renameRemote(sessionId: SftpSessionId, oldPath: string, newPath: string): Promise<void>;
  mkdirRemote(sessionId: SftpSessionId, path: string): Promise<void>;
  openWith(
    sessionId: SftpSessionId,
    remotePath: string,
    application: string | null,
  ): Promise<WatcherId>;
  resolveOpenWithConflict(watcherId: WatcherId, resolution: ConflictResolution): Promise<void>;
  closeOpenWith(watcherId: WatcherId): Promise<void>;
  listAssociations(): Promise<Association[]>;
  setAssociation(extension: string, appPath: string, appName: string): Promise<void>;
  deleteAssociation(extension: string): Promise<void>;
  close(sessionId: SftpSessionId): Promise<void>;
};

export const sftpApi: SftpApi = {
  open: (profile, onEvent) =>
    callStreamingCommand<unknown, SftpSessionEvent, SftpSessionId>(
      "sftp_open",
      { profile },
      (event) => {
        if (isSftpSessionEvent(event)) onEvent(event);
      },
    ),
  decideHostKey: (sessionId, trust) =>
    callCommand("sftp_decide_host_key", { sessionId, trust }),
  reconnect: (sessionId) => callCommand("sftp_reconnect", { sessionId }),
  listRemote: (sessionId, path, showHidden) =>
    callCommand("sftp_list_remote", { sessionId, path, showHidden }),
  listLocal: (path, showHidden) => callCommand("sftp_list_local", { path, showHidden }),
  enqueueUpload: (sessionId, items, remoteDir, policy) =>
    callCommand("sftp_enqueue_upload", { sessionId, items, remoteDir, policy }),
  enqueueDownload: (sessionId, items, localDir, policy) =>
    callCommand("sftp_enqueue_download", { sessionId, items, localDir, policy }),
  resolveConflict: (transferId, itemId, resolution) =>
    callCommand("sftp_resolve_conflict", { transferId, itemId, resolution }),
  cancelTransfer: (transferId) => callCommand("sftp_cancel_transfer", { transferId }),
  deleteRemote: (sessionId, path) =>
    callCommand("sftp_delete_remote", { sessionId, path }),
  renameRemote: (sessionId, oldPath, newPath) =>
    callCommand("sftp_rename_remote", { sessionId, oldPath, newPath }),
  mkdirRemote: (sessionId, path) => callCommand("sftp_mkdir_remote", { sessionId, path }),
  openWith: (sessionId, remotePath, application) =>
    callCommand("sftp_open_with", { sessionId, remotePath, application }),
  resolveOpenWithConflict: (watcherId, resolution) =>
    callCommand("sftp_resolve_open_with_conflict", { watcherId, resolution }),
  closeOpenWith: (watcherId) => callCommand("sftp_close_open_with", { watcherId }),
  listAssociations: () => callCommand("sftp_list_associations", {}),
  setAssociation: (extension, appPath, appName) =>
    callCommand("sftp_set_association", { extension, appPath, appName }),
  deleteAssociation: (extension) => callCommand("sftp_delete_association", { extension }),
  close: (sessionId) => callCommand("sftp_close", { sessionId }),
};

/** Re-exported for store/panel typing convenience. */
export type { SftpDirection };
