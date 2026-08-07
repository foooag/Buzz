import { COMMANDS } from "@shared/ipc/command-names";
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
      COMMANDS.sftpOpen,
      { profile },
      (event) => {
        if (isSftpSessionEvent(event)) onEvent(event);
      },
    ),
  decideHostKey: (sessionId, trust) =>
    callCommand(COMMANDS.sftpDecideHostKey, { sessionId, trust }),
  reconnect: (sessionId) => callCommand(COMMANDS.sftpReconnect, { sessionId }),
  listRemote: (sessionId, path, showHidden) =>
    callCommand(COMMANDS.sftpListRemote, { sessionId, path, showHidden }),
  listLocal: (path, showHidden) => callCommand(COMMANDS.sftpListLocal, { path, showHidden }),
  enqueueUpload: (sessionId, items, remoteDir, policy) =>
    callCommand(COMMANDS.sftpEnqueueUpload, { sessionId, items, remoteDir, policy }),
  enqueueDownload: (sessionId, items, localDir, policy) =>
    callCommand(COMMANDS.sftpEnqueueDownload, { sessionId, items, localDir, policy }),
  resolveConflict: (transferId, itemId, resolution) =>
    callCommand(COMMANDS.sftpResolveConflict, { transferId, itemId, resolution }),
  cancelTransfer: (transferId) => callCommand(COMMANDS.sftpCancelTransfer, { transferId }),
  deleteRemote: (sessionId, path) =>
    callCommand(COMMANDS.sftpDeleteRemote, { sessionId, path }),
  renameRemote: (sessionId, oldPath, newPath) =>
    callCommand(COMMANDS.sftpRenameRemote, { sessionId, oldPath, newPath }),
  mkdirRemote: (sessionId, path) => callCommand(COMMANDS.sftpMkdirRemote, { sessionId, path }),
  openWith: (sessionId, remotePath, application) =>
    callCommand(COMMANDS.sftpOpenWith, { sessionId, remotePath, application }),
  resolveOpenWithConflict: (watcherId, resolution) =>
    callCommand(COMMANDS.sftpResolveOpenWithConflict, { watcherId, resolution }),
  closeOpenWith: (watcherId) => callCommand(COMMANDS.sftpCloseOpenWith, { watcherId }),
  listAssociations: () => callCommand(COMMANDS.sftpListAssociations, {}),
  setAssociation: (extension, appPath, appName) =>
    callCommand(COMMANDS.sftpSetAssociation, { extension, appPath, appName }),
  deleteAssociation: (extension) => callCommand(COMMANDS.sftpDeleteAssociation, { extension }),
  close: (sessionId) => callCommand(COMMANDS.sftpClose, { sessionId }),
};

/** Re-exported for store/panel typing convenience. */
export type { SftpDirection };
