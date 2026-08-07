import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success, type IpcResult } from "../../../shared/ipc/result.js";
import { listLocal } from "./local-files.js";
import { SftpAssociations } from "./associations.js";
import { SftpRuntime } from "./runtime.js";

const port = z.number().int().min(0).max(65_535);
const profile = z.object({
  hostId: z.string(), hostname: z.string(), port: port.nullable().optional(),
  username: z.string(), authKind: z.enum(["password", "privateKey"]),
  credentialRef: z.string(), identityId: z.string().nullable().optional(),
  keepaliveInterval: z.number().int().nonnegative().nullable().optional(),
});
const session = z.object({ sessionId: z.string() });
const policy = z.enum(["ask", "overwrite", "skip", "rename"]);
const resolution = z.discriminatedUnion("resolution", [
  z.object({ resolution: z.literal("overwrite") }),
  z.object({ resolution: z.literal("skip") }),
  z.object({ resolution: z.literal("rename"), newName: z.string() }),
  z.object({ resolution: z.literal("applyToAll"), applyToAll: policy }),
]);

export function createSftpCommandHandlers(
  runtime: SftpRuntime,
  associations: SftpAssociations,
): CommandHandlers {
  return {
    sftp_open: command(
      z.object({ profile }),
      ({ profile }, context) => runtime.open(profile, context.streamId),
    ),
    sftp_decide_host_key: command(
      z.object({ sessionId: z.string(), trust: z.boolean() }),
      ({ sessionId, trust }) => runtime.decideHostKey(sessionId, trust),
    ),
    sftp_reconnect: command(session, ({ sessionId }) => runtime.reconnect(sessionId)),
    sftp_list_remote: command(
      z.object({ sessionId: z.string(), path: z.string(), showHidden: z.boolean() }),
      ({ sessionId, path, showHidden }) => runtime.listRemote(sessionId, path, showHidden),
    ),
    sftp_list_local: command(
      z.object({ path: z.string(), showHidden: z.boolean() }),
      ({ path, showHidden }) => listLocal(path, showHidden),
    ),
    sftp_enqueue_upload: command(
      z.object({ sessionId: z.string(), items: z.array(z.string()), remoteDir: z.string(), policy }),
      ({ sessionId, items, remoteDir, policy }) => runtime.enqueueUpload(
        sessionId, items, remoteDir, policy,
      ),
    ),
    sftp_enqueue_download: command(
      z.object({ sessionId: z.string(), items: z.array(z.string()), localDir: z.string(), policy }),
      ({ sessionId, items, localDir, policy }) => runtime.enqueueDownload(
        sessionId, items, localDir, policy,
      ),
    ),
    sftp_resolve_conflict: command(
      z.object({ transferId: z.string(), itemId: z.string(), resolution }),
      ({ transferId, itemId, resolution }) => runtime.resolveConflict(
        transferId, itemId, resolution,
      ),
    ),
    sftp_cancel_transfer: command(
      z.object({ transferId: z.string() }),
      ({ transferId }) => runtime.cancelTransfer(transferId),
    ),
    sftp_delete_remote: command(
      z.object({ sessionId: z.string(), path: z.string() }),
      ({ sessionId, path }) => runtime.deleteRemote(sessionId, path),
    ),
    sftp_rename_remote: command(
      z.object({ sessionId: z.string(), oldPath: z.string(), newPath: z.string() }),
      ({ sessionId, oldPath, newPath }) => runtime.renameRemote(sessionId, oldPath, newPath),
    ),
    sftp_mkdir_remote: command(
      z.object({ sessionId: z.string(), path: z.string() }),
      ({ sessionId, path }) => runtime.mkdirRemote(sessionId, path),
    ),
    sftp_open_with: command(
      z.object({ sessionId: z.string(), remotePath: z.string(), application: z.string().nullable() }),
      ({ sessionId, remotePath, application }) => runtime.openWith(
        sessionId, remotePath, application,
      ),
    ),
    sftp_resolve_open_with_conflict: command(
      z.object({ watcherId: z.string(), resolution }),
      ({ watcherId, resolution }) => runtime.resolveOpenWithConflict(watcherId, resolution),
    ),
    sftp_close_open_with: command(
      z.object({ watcherId: z.string() }),
      ({ watcherId }) => runtime.closeOpenWith(watcherId),
    ),
    sftp_list_associations: command(z.object({}), () => associations.list()),
    sftp_set_association: command(
      z.object({ extension: z.string(), appPath: z.string(), appName: z.string() }),
      ({ extension, appPath, appName }) => { associations.set(extension, appPath, appName); },
    ),
    sftp_delete_association: command(
      z.object({ extension: z.string() }),
      ({ extension }) => associations.delete(extension),
    ),
    sftp_close: command(session, ({ sessionId }) => runtime.close(sessionId)),
  };
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input, context: CommandContext) => Output | Promise<Output>,
): CommandHandler {
  return async (rawInput, context) => {
    try {
      const output = await operation(schema.parse(rawInput ?? {}), context);
      return isIpcResult(output) ? output : success(output);
    } catch (error) {
      if (error instanceof DomainError) return error.toResult();
      if (error instanceof ZodError) {
        return failure("IPC_INVALID_INPUT", "The desktop operation received invalid input.");
      }
      throw error;
    }
  };
}
function isIpcResult(value: unknown): value is IpcResult<unknown> {
  return typeof value === "object" && value !== null && "ok" in value;
}
