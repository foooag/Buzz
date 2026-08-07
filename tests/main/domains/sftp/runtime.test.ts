import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client, FileEntryWithStats, SFTPWrapper, Stats } from "ssh2";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SshRuntime } from "../../../../src/main/domains/ssh/runtime";
import { SftpRuntime } from "../../../../src/main/domains/sftp/runtime";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Electron SFTP runtime", () => {
  it("opens, lists stable safe metadata, mutates remote paths and closes", async () => {
    const sftp = new FakeSftp();
    sftp.entries = [entry("z.txt", false, 2), entry(".hidden", false, 1), entry("a", true, 0)];
    const { runtime, events, client } = await openedRuntime(sftp);
    const sessionId = events.find((event) => event.type === "connectionStateChanged")?.sessionId as string;

    await expect(runtime.listRemote(sessionId, "/", false)).resolves.toEqual([
      expect.objectContaining({ name: "a", isDir: true }),
      expect.objectContaining({ name: "z.txt", size: 2 }),
    ]);
    await runtime.deleteRemote(sessionId, "/z.txt");
    await runtime.renameRemote(sessionId, "/a", "/b");
    await runtime.mkdirRemote(sessionId, "/new");
    expect(sftp.unlink).toHaveBeenCalledWith("/z.txt", expect.any(Function));
    expect(sftp.rename).toHaveBeenCalledWith("/a", "/b", expect.any(Function));
    expect(sftp.mkdir).toHaveBeenCalledWith("/new", expect.any(Function));

    await runtime.close(sessionId);
    expect(sftp.end).toHaveBeenCalledOnce();
    expect(client.end).toHaveBeenCalledOnce();
    expect(events).toContainEqual({
      type: "connectionStateChanged", sessionId, state: "disconnected",
    });
  });

  it("streams upload progress and completion summary", async () => {
    const directory = temporaryDirectory();
    const localPath = path.join(directory, "upload.txt");
    writeFileSync(localPath, "payload");
    const sftp = new FakeSftp();
    sftp.exists = false;
    const { runtime, events } = await openedRuntime(sftp);
    const sessionId = events[0].sessionId as string;

    const transferId = runtime.enqueueUpload(sessionId, [localPath], "/remote", "overwrite");
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: "sftpTransferCompleted",
      transferId,
      summary: { succeeded: 1, failed: 0, skipped: 0 },
    })));
    expect(events).toContainEqual(expect.objectContaining({
      type: "sftpTransferProgress",
      transferId,
      transferred: 7,
      total: 7,
    }));
    await runtime.closeAll();
  });

  it("pauses an ask-policy conflict until the renderer resolves it", async () => {
    const directory = temporaryDirectory();
    const localPath = path.join(directory, "conflict.txt");
    writeFileSync(localPath, "payload");
    const sftp = new FakeSftp();
    sftp.exists = true;
    const { runtime, events } = await openedRuntime(sftp);
    const sessionId = events[0].sessionId as string;
    const transferId = runtime.enqueueUpload(sessionId, [localPath], "/remote", "ask");

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: "sftpTransferConflict",
      transferId,
    })));
    const conflict = events.find((event) => event.type === "sftpTransferConflict") as {
      itemId: string;
    };
    runtime.resolveConflict(transferId, conflict.itemId, { resolution: "skip" });
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: "sftpTransferCompleted",
      summary: { succeeded: 0, failed: 0, skipped: 1 },
    })));
    expect(sftp.fastPut).not.toHaveBeenCalled();
    await runtime.closeAll();
  });
});

class FakeSftp extends EventEmitter {
  entries: FileEntryWithStats[] = [];
  exists = false;
  readonly end = vi.fn();
  readonly unlink = vi.fn((_path: string, done: (error?: Error | null) => void) => done());
  readonly rename = vi.fn((_old: string, _next: string, done: (error?: Error | null) => void) => done());
  readonly mkdir = vi.fn((_path: string, done: (error?: Error | null) => void) => done());
  readonly readdir = vi.fn((_path: string, done: (error: Error | undefined, entries: FileEntryWithStats[]) => void) => done(undefined, this.entries));
  readonly stat = vi.fn((_path: string, done: (error?: Error | null, stats?: Stats) => void) => {
    if (this.exists) done(null, stats(false, 7));
    else done(new Error("missing"));
  });
  readonly lstat = this.stat;
  readonly fastPut = vi.fn((_local: string, _remote: string, options: {
    step(total: number, chunk: number, size: number): void;
  }, done: (error?: Error | null) => void) => {
    options.step(7, 7, 7);
    done();
  });
}

async function openedRuntime(sftp: FakeSftp) {
  const client = {
    sftp: (done: (error: Error | undefined, opened: SFTPWrapper) => void) => {
      done(undefined, sftp as unknown as SFTPWrapper);
    },
    end: vi.fn(),
  } as unknown as Client & { end: ReturnType<typeof vi.fn> };
  const ssh = {
    connectClient: vi.fn(async () => client),
    decideHostKey: vi.fn(),
  } as unknown as SshRuntime;
  const events: Array<Record<string, unknown>> = [];
  const runtime = new SftpRuntime(ssh, (_stream, event) => events.push(event));
  await runtime.open({
    hostId: "h1", hostname: "host", port: 22, username: "user",
    authKind: "password", credentialRef: "ref",
  });
  return { runtime, events, client };
}

function entry(filename: string, directory: boolean, size: number): FileEntryWithStats {
  return { filename, longname: filename, attrs: stats(directory, size) };
}

function stats(directory: boolean, size: number): Stats {
  return {
    mode: directory ? 0o40755 : 0o100644, uid: 0, gid: 0, size, atime: 0, mtime: 1,
    isDirectory: () => directory, isFile: () => !directory,
    isBlockDevice: () => false, isCharacterDevice: () => false,
    isSymbolicLink: () => false, isFIFO: () => false, isSocket: () => false,
  };
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-sftp-runtime-"));
  directories.push(directory);
  return directory;
}
