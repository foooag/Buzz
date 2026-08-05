import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../ipc/dispatcher";
import { createSftpCommandHandlers } from "./commands";
import type { SftpAssociations } from "./associations";
import type { SftpRuntime } from "./runtime";

const expectedCommands = [
  "sftp_open", "sftp_decide_host_key", "sftp_reconnect", "sftp_list_remote",
  "sftp_list_local", "sftp_enqueue_upload", "sftp_enqueue_download",
  "sftp_resolve_conflict", "sftp_cancel_transfer", "sftp_delete_remote",
  "sftp_rename_remote", "sftp_mkdir_remote", "sftp_open_with",
  "sftp_resolve_open_with_conflict", "sftp_close_open_with",
  "sftp_list_associations", "sftp_set_association", "sftp_delete_association",
  "sftp_close",
];

describe("Electron SFTP command handlers", () => {
  it("owns all 19 SFTP IPC commands as one migration unit", () => {
    const handlers = createSftpCommandHandlers(fakeRuntime(), fakeAssociations());
    expect(Object.keys(handlers)).toEqual(expectedCommands);
  });

  it("routes session, remote mutation, transfer and Open-With commands", async () => {
    const runtime = fakeRuntime();
    const associations = fakeAssociations();
    const handlers = createSftpCommandHandlers(runtime, associations);
    const context: CommandContext = { streamId: "stream-1", fallback: vi.fn() };
    const profile = {
      hostId: "h1", hostname: "host", port: 22, username: "user",
      authKind: "password", credentialRef: "ref", identityId: null,
    };
    const cases = [
      ["sftp_open", { profile }, "open"],
      ["sftp_decide_host_key", { sessionId: "s1", trust: true }, "decideHostKey"],
      ["sftp_reconnect", { sessionId: "s1" }, "reconnect"],
      ["sftp_list_remote", { sessionId: "s1", path: "/", showHidden: false }, "listRemote"],
      ["sftp_enqueue_upload", {
        sessionId: "s1", items: ["/tmp/a"], remoteDir: "/tmp", policy: "overwrite",
      }, "enqueueUpload"],
      ["sftp_enqueue_download", {
        sessionId: "s1", items: ["/tmp/a"], localDir: "/tmp", policy: "overwrite",
      }, "enqueueDownload"],
      ["sftp_resolve_conflict", {
        transferId: "t1", itemId: "i1", resolution: { resolution: "skip" },
      }, "resolveConflict"],
      ["sftp_cancel_transfer", { transferId: "t1" }, "cancelTransfer"],
      ["sftp_delete_remote", { sessionId: "s1", path: "/a" }, "deleteRemote"],
      ["sftp_rename_remote", {
        sessionId: "s1", oldPath: "/a", newPath: "/b",
      }, "renameRemote"],
      ["sftp_mkdir_remote", { sessionId: "s1", path: "/dir" }, "mkdirRemote"],
      ["sftp_open_with", {
        sessionId: "s1", remotePath: "/a.txt", application: null,
      }, "openWith"],
      ["sftp_resolve_open_with_conflict", {
        watcherId: "w1", resolution: { resolution: "overwrite" },
      }, "resolveOpenWithConflict"],
      ["sftp_close_open_with", { watcherId: "w1" }, "closeOpenWith"],
      ["sftp_close", { sessionId: "s1" }, "close"],
    ] as const;

    for (const [name, input, result] of cases) {
      await expect(handlers[name]?.(input, context)).resolves.toEqual({ ok: true, data: result });
    }
    await expect(handlers.sftp_list_associations?.({}, context)).resolves.toEqual({
      ok: true, data: "list",
    });
    await handlers.sftp_set_association?.({
      extension: "txt", appPath: "/app", appName: "App",
    }, context);
    await handlers.sftp_delete_association?.({ extension: "txt" }, context);
    expect(context.fallback).not.toHaveBeenCalled();
  });

  it("rejects malformed conflict resolutions before touching a transfer", async () => {
    const runtime = fakeRuntime();
    const handler = createSftpCommandHandlers(runtime, fakeAssociations()).sftp_resolve_conflict;
    const context: CommandContext = { fallback: vi.fn() };
    await expect(handler?.({
      transferId: "t", itemId: "i", resolution: { resolution: "rename" },
    }, context)).resolves.toMatchObject({ ok: false, error: { code: "IPC_INVALID_INPUT" } });
    expect(runtime.resolveConflict).not.toHaveBeenCalled();
  });
});

function fakeRuntime(): SftpRuntime {
  const names = [
    "open", "decideHostKey", "reconnect", "listRemote", "enqueueUpload",
    "enqueueDownload", "resolveConflict", "cancelTransfer", "deleteRemote",
    "renameRemote", "mkdirRemote", "openWith", "resolveOpenWithConflict",
    "closeOpenWith", "close",
  ] as const;
  return Object.fromEntries(
    names.map((name) => [name, vi.fn(async () => name)]),
  ) as unknown as SftpRuntime;
}

function fakeAssociations(): SftpAssociations {
  return {
    list: vi.fn(() => "list"), set: vi.fn(), delete: vi.fn(),
  } as unknown as SftpAssociations;
}
