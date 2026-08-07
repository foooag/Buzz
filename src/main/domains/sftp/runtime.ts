import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, rm, stat as localStat } from "node:fs/promises";
import path from "node:path";
import type { Client, FileEntryWithStats, SFTPWrapper, Stats } from "ssh2";
import { DomainError } from "../../ipc/domain-error.js";
import { confineUnder } from "./path-safety.js";
import { SshRuntime, type CreateSshProfile } from "../ssh/runtime.js";

type Event = Record<string, unknown> & { type: string; sessionId: string };
type Policy = "ask" | "overwrite" | "skip" | "rename";
type Resolution =
  | { resolution: "overwrite" | "skip" }
  | { resolution: "rename"; newName: string }
  | { resolution: "applyToAll"; applyToAll: Policy };

type Session = {
  client: Client;
  sftp: SFTPWrapper;
  profile: CreateSshProfile;
  streamId?: string;
};
type PendingConflict = { resolve(value: Resolution): void };
type TransferJob = {
  sessionId: string;
  cancelled: boolean;
  policy: Policy;
  pending: Map<string, PendingConflict>;
};
type TransferItem = { source: string; destination: string; relative: string; size: number };
type Watcher = {
  id: string;
  sessionId: string;
  remotePath: string;
  remoteName: string;
  localPath: string;
  localMtime: number;
  remoteSize: number;
  remoteMtime: number;
  interval: ReturnType<typeof setInterval>;
  polling: boolean;
  pending?: { resolve(value: Resolution): void };
};

export class SftpRuntime {
  readonly #ssh: SshRuntime;
  readonly #emit: (streamId: string | undefined, event: Event) => void;
  readonly #sessions = new Map<string, Session>();
  readonly #transfers = new Map<string, TransferJob>();
  readonly #watchers = new Map<string, Watcher>();
  readonly #workspaceRoot: string;

  constructor(
    ssh: SshRuntime,
    emit: (streamId: string | undefined, event: Event) => void,
    workspaceRoot = path.join(process.cwd(), ".terminus-sftp-open"),
  ) {
    this.#ssh = ssh;
    this.#emit = emit;
    this.#workspaceRoot = workspaceRoot;
  }

  async open(profile: CreateSshProfile, streamId?: string): Promise<string> {
    const sessionId = randomUUID();
    const client = await this.#ssh.connectClient(profile, sessionId, streamId);
    let sftp: SFTPWrapper;
    try {
      sftp = await new Promise((resolve, reject) => client.sftp((error, opened) => {
        if (error) reject(notConnected("The SFTP subsystem was refused."));
        else resolve(opened);
      }));
    } catch (error) {
      client.end();
      throw error;
    }
    this.#sessions.set(sessionId, { client, sftp, profile, streamId });
    this.#state(sessionId, streamId, "connected");
    return sessionId;
  }

  decideHostKey(sessionId: string, trust: boolean): void {
    this.#ssh.decideHostKey(sessionId, trust);
  }

  async reconnect(sessionId: string): Promise<string> {
    const session = this.#session(sessionId);
    this.#state(sessionId, session.streamId, "reconnecting");
    const { profile, streamId } = session;
    await this.close(sessionId);
    return this.open(profile, streamId);
  }

  async listRemote(sessionId: string, remotePath: string, showHidden: boolean) {
    const entries = await callback<FileEntryWithStats[]>(
      (done) => this.#session(sessionId).sftp.readdir(remotePath, done),
      notFound("The remote path could not be read."),
    );
    return entries
      .filter((entry) => showHidden || !entry.filename.startsWith("."))
      .map((entry) => ({
        name: entry.filename,
        isDir: entry.attrs.isDirectory(),
        size: entry.attrs.size,
        modified: entry.attrs.mtime ? new Date(entry.attrs.mtime * 1000).toISOString() : null,
        permissions: entry.attrs.mode ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async deleteRemote(sessionId: string, remotePath: string): Promise<void> {
    await callback((done) => this.#session(sessionId).sftp.unlink(remotePath, done),
      notFound("The remote file could not be deleted."));
  }

  async renameRemote(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    await callback((done) => this.#session(sessionId).sftp.rename(oldPath, newPath, done),
      notConnected("The remote item could not be renamed."));
  }

  async mkdirRemote(sessionId: string, remotePath: string): Promise<void> {
    await callback((done) => this.#session(sessionId).sftp.mkdir(remotePath, done),
      notConnected("The remote directory could not be created."));
  }

  enqueueUpload(
    sessionId: string,
    items: string[],
    remoteDir: string,
    policy: Policy,
  ): string {
    this.#session(sessionId);
    const transferId = randomUUID();
    const job: TransferJob = { sessionId, cancelled: false, policy, pending: new Map() };
    this.#transfers.set(transferId, job);
    void this.#runUpload(transferId, items, remoteDir, job);
    return transferId;
  }

  enqueueDownload(
    sessionId: string,
    items: string[],
    localDir: string,
    policy: Policy,
  ): string {
    this.#session(sessionId);
    const transferId = randomUUID();
    const job: TransferJob = { sessionId, cancelled: false, policy, pending: new Map() };
    this.#transfers.set(transferId, job);
    void this.#runDownload(transferId, items, localDir, job);
    return transferId;
  }

  resolveConflict(transferId: string, itemId: string, resolution: Resolution): void {
    const job = this.#transfers.get(transferId);
    const pending = job?.pending.get(itemId);
    if (!job || !pending) throw transferNotFound();
    job.pending.delete(itemId);
    if (resolution.resolution === "applyToAll") job.policy = resolution.applyToAll;
    pending.resolve(resolution);
  }

  cancelTransfer(transferId: string): void {
    const job = this.#transfers.get(transferId);
    if (!job) throw transferNotFound();
    job.cancelled = true;
    for (const conflict of job.pending.values()) conflict.resolve({ resolution: "skip" });
    job.pending.clear();
  }

  async openWith(
    sessionId: string,
    remotePath: string,
    application: string | null,
  ): Promise<string> {
    const session = this.#session(sessionId);
    const remoteName = path.posix.basename(remotePath);
    if (!remoteName || remoteName === "." || remoteName === "..") throw invalidPath();
    const watcherId = randomUUID();
    const directory = path.join(this.#workspaceRoot, watcherId);
    const localPath = confineUnder(directory, remoteName);
    await mkdir(directory, { recursive: true });
    const baseline = await statRemote(session.sftp, remotePath);
    await callback<void>((done) => session.sftp.fastGet(remotePath, localPath, done), transferFailed());
    const snapshot = await localStat(localPath);
    await launchFile(localPath, application);
    const watcher = {
      id: watcherId,
      sessionId,
      remotePath,
      remoteName,
      localPath,
      localMtime: snapshot.mtimeMs,
      remoteSize: baseline.size,
      remoteMtime: baseline.mtime,
      interval: setInterval(() => undefined, 1_000),
      polling: false,
    } satisfies Watcher;
    clearInterval(watcher.interval);
    watcher.interval = setInterval(() => void this.#pollWatcher(watcher), 1_000);
    watcher.interval.unref();
    this.#watchers.set(watcherId, watcher);
    this.#emit(session.streamId, {
      type: "sftpOpenWithLaunched", sessionId, watcherId, remoteName,
      needsAssociationPrompt: application === null,
    });
    return watcherId;
  }

  async resolveOpenWithConflict(watcherId: string, resolution: Resolution): Promise<void> {
    const watcher = this.#watchers.get(watcherId);
    if (!watcher?.pending) throw watcherNotFound();
    watcher.pending.resolve(resolution);
    watcher.pending = undefined;
  }

  async closeOpenWith(watcherId: string): Promise<void> {
    const watcher = this.#watchers.get(watcherId);
    if (!watcher) return;
    this.#watchers.delete(watcherId);
    clearInterval(watcher.interval);
    watcher.pending?.resolve({ resolution: "skip" });
    await rm(path.dirname(watcher.localPath), { recursive: true, force: true });
    const session = this.#sessions.get(watcher.sessionId);
    this.#emit(session?.streamId, {
      type: "sftpOpenWithClosed", sessionId: watcher.sessionId, watcherId,
    });
  }

  async close(sessionId: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    this.#sessions.delete(sessionId);
    session.sftp.end();
    session.client.end();
    this.#state(sessionId, session.streamId, "disconnected");
  }

  async closeAll(): Promise<void> {
    for (const job of this.#transfers.values()) job.cancelled = true;
    await Promise.all([...this.#watchers.keys()].map((id) => this.closeOpenWith(id)));
    await Promise.all([...this.#sessions.keys()].map((id) => this.close(id)));
  }

  async #pollWatcher(watcher: Watcher): Promise<void> {
    if (watcher.polling || watcher.pending) return;
    watcher.polling = true;
    try {
      const local = await localStat(watcher.localPath);
      if (local.mtimeMs === watcher.localMtime) return;
      const session = this.#session(watcher.sessionId);
      const remote = await statRemote(session.sftp, watcher.remotePath);
      if (remote.size !== watcher.remoteSize || remote.mtime !== watcher.remoteMtime) {
        const resolution = new Promise<Resolution>((resolve) => { watcher.pending = { resolve }; });
        this.#emit(session.streamId, {
          type: "sftpOpenWithConflict", sessionId: watcher.sessionId, watcherId: watcher.id,
          kind: { kind: "remoteChanged", remoteName: watcher.remoteName },
        });
        const choice = await resolution;
        watcher.pending = undefined;
        if (choice.resolution === "skip") {
          watcher.localMtime = local.mtimeMs;
          return;
        }
        if (choice.resolution === "rename") {
          watcher.remotePath = path.posix.join(
            path.posix.dirname(watcher.remotePath),
            path.posix.basename(choice.newName),
          );
        }
      }
      await callback<void>((done) => session.sftp.fastPut(
        watcher.localPath,
        watcher.remotePath,
        done,
      ), transferFailed());
      const updatedRemote = await statRemote(session.sftp, watcher.remotePath);
      watcher.localMtime = local.mtimeMs;
      watcher.remoteSize = updatedRemote.size;
      watcher.remoteMtime = updatedRemote.mtime;
      this.#emit(session.streamId, {
        type: "sftpOpenWithSaved", sessionId: watcher.sessionId,
        watcherId: watcher.id, remoteName: path.posix.basename(watcher.remotePath),
      });
    } catch {
      // A transient stat/transfer failure is retried on the next polling pass.
    } finally {
      watcher.polling = false;
    }
  }

  async #runUpload(id: string, roots: string[], remoteDir: string, job: TransferJob) {
    const session = this.#session(job.sessionId);
    let items: TransferItem[] = [];
    try {
      for (const root of roots) items.push(...await expandLocal(root, remoteDir));
    } catch {
      // Individual unreadable roots are recorded by the queue below.
    }
    this.#queued(session, id, "upload", items.length);
    const summary = { succeeded: 0, failed: 0, skipped: 0 };
    for (const item of items) {
      const itemId = randomUUID();
      if (job.cancelled) { summary.failed++; break; }
      try {
        const destination = await this.#resolveTarget(session, id, itemId, item.destination, job);
        if (!destination) { summary.skipped++; continue; }
        await ensureRemoteParents(session.sftp, path.posix.dirname(destination));
        await callback<void>((done) => session.sftp.fastPut(item.source, destination, {
          step: (transferred, _chunk, total) => this.#emit(session.streamId, {
            type: "sftpTransferProgress", sessionId: job.sessionId, transferId: id,
            itemId, transferred, total,
          }),
        }, done), transferFailed());
        summary.succeeded++;
        this.#completed(session, id, itemId);
      } catch (error) {
        summary.failed++;
        this.#failed(session, id, itemId, error);
      }
    }
    this.#finish(session, id, summary);
  }

  async #runDownload(id: string, roots: string[], localDir: string, job: TransferJob) {
    const session = this.#session(job.sessionId);
    const items: TransferItem[] = [];
    try {
      for (const root of roots) await expandRemote(session.sftp, root, localDir, items, path.posix.basename(root));
    } catch {
      // The resulting empty/partial queue reports through its summary.
    }
    this.#queued(session, id, "download", items.length);
    const summary = { succeeded: 0, failed: 0, skipped: 0 };
    for (const item of items) {
      const itemId = randomUUID();
      if (job.cancelled) { summary.failed++; break; }
      try {
        let destination = item.destination;
        if (await localExists(destination)) {
          const resolution = await this.#conflict(session, id, itemId, path.basename(destination), job);
          if (resolution.resolution === "skip") { summary.skipped++; continue; }
          if (resolution.resolution === "rename") {
            destination = confineUnder(path.dirname(destination), resolution.newName);
          }
        }
        await mkdir(path.dirname(destination), { recursive: true });
        await callback<void>((done) => session.sftp.fastGet(item.source, destination, {
          step: (transferred, _chunk, total) => this.#emit(session.streamId, {
            type: "sftpTransferProgress", sessionId: job.sessionId, transferId: id,
            itemId, transferred, total,
          }),
        }, done), transferFailed());
        summary.succeeded++;
        this.#completed(session, id, itemId);
      } catch (error) {
        summary.failed++;
        this.#failed(session, id, itemId, error);
      }
    }
    this.#finish(session, id, summary);
  }

  async #resolveTarget(
    session: Session, transferId: string, itemId: string, target: string, job: TransferJob,
  ): Promise<string | null> {
    if (!(await remoteExists(session.sftp, target))) return target;
    const resolution = await this.#conflict(session, transferId, itemId, path.posix.basename(target), job);
    if (resolution.resolution === "skip") return null;
    if (resolution.resolution === "rename") {
      return path.posix.join(path.posix.dirname(target), path.posix.basename(resolution.newName));
    }
    return target;
  }

  async #conflict(
    session: Session, transferId: string, itemId: string, targetName: string, job: TransferJob,
  ): Promise<Resolution> {
    if (job.policy === "overwrite") return { resolution: "overwrite" };
    if (job.policy === "skip") return { resolution: "skip" };
    if (job.policy === "rename") return { resolution: "rename", newName: renamed(targetName) };
    const resolution = new Promise<Resolution>((resolve) => job.pending.set(itemId, { resolve }));
    this.#emit(session.streamId, {
      type: "sftpTransferConflict", sessionId: job.sessionId, transferId, itemId,
      kind: { kind: "targetExists", targetName },
    });
    return resolution;
  }

  #queued(session: Session, id: string, direction: string, itemCount: number) {
    this.#emit(session.streamId, {
      type: "sftpTransferQueued", sessionId: idFor(session, this.#sessions),
      transferId: id, direction, itemCount,
    });
  }
  #completed(session: Session, transferId: string, itemId: string) {
    this.#emit(session.streamId, {
      type: "sftpTransferItemCompleted", sessionId: idFor(session, this.#sessions), transferId, itemId,
    });
  }
  #failed(session: Session, transferId: string, itemId: string, error: unknown) {
    this.#emit(session.streamId, {
      type: "sftpTransferItemFailed", sessionId: idFor(session, this.#sessions), transferId, itemId,
      code: error instanceof DomainError ? error.code : "SFTP_TRANSFER_FAILED",
    });
  }
  #finish(session: Session, transferId: string, summary: object) {
    this.#transfers.delete(transferId);
    this.#emit(session.streamId, {
      type: "sftpTransferCompleted", sessionId: idFor(session, this.#sessions), transferId, summary,
    });
  }
  #state(sessionId: string, streamId: string | undefined, state: string) {
    this.#emit(streamId, { type: "connectionStateChanged", sessionId, state });
  }
  #session(id: string): Session {
    const session = this.#sessions.get(id);
    if (!session) throw sessionNotFound();
    return session;
  }
}

async function expandLocal(root: string, remoteDir: string, base = path.basename(root)): Promise<TransferItem[]> {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink()) return [];
  if (metadata.isFile()) return [{
    source: root, destination: path.posix.join(remoteDir, base), relative: base, size: metadata.size,
  }];
  if (!metadata.isDirectory()) return [];
  const result: TransferItem[] = [];
  for (const name of await readdir(root)) {
    result.push(...await expandLocal(path.join(root, name), remoteDir, path.posix.join(base, name)));
  }
  return result;
}

async function expandRemote(
  sftp: SFTPWrapper, remote: string, localRoot: string, out: TransferItem[], relative: string,
): Promise<void> {
  const stats = await statRemote(sftp, remote);
  if (stats.isSymbolicLink()) return;
  if (stats.isFile()) {
    out.push({ source: remote, destination: confineUnder(localRoot, relative), relative, size: stats.size });
    return;
  }
  if (!stats.isDirectory()) return;
  const entries = await callback<FileEntryWithStats[]>(
    (done) => sftp.readdir(remote, done), notFound("The remote path could not be read."));
  for (const entry of entries) {
    await expandRemote(sftp, path.posix.join(remote, entry.filename), localRoot, out,
      path.posix.join(relative, entry.filename));
  }
}

function statRemote(sftp: SFTPWrapper, remote: string): Promise<Stats> {
  return callback((done) => sftp.lstat(remote, done), notFound("The remote item was not found."));
}
function remoteExists(sftp: SFTPWrapper, remote: string): Promise<boolean> {
  return new Promise((resolve) => sftp.stat(remote, (error) => resolve(!error)));
}
async function ensureRemoteParents(sftp: SFTPWrapper, directory: string): Promise<void> {
  if (!directory || directory === "." || directory === "/") return;
  const parent = path.posix.dirname(directory);
  if (parent !== directory) await ensureRemoteParents(sftp, parent);
  if (!(await remoteExists(sftp, directory))) {
    await callback<void>((done) => sftp.mkdir(directory, done), notConnected("Remote directory creation failed."));
  }
}
async function localExists(value: string): Promise<boolean> {
  try { await lstat(value); return true; } catch { return false; }
}
function renamed(name: string): string {
  const extension = path.extname(name);
  return `${path.basename(name, extension)} copy${extension}`;
}
async function launchFile(filePath: string, application: string | null): Promise<void> {
  if (!application) {
    const { shell } = await import("electron");
    const error = await shell.openPath(filePath);
    if (error) throw launchFailed();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const command = process.platform === "darwin" ? "/usr/bin/open" : application;
    const args = process.platform === "darwin" ? ["-a", application, filePath] : [filePath];
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  }).catch(() => { throw launchFailed(); });
}
function idFor(session: Session, sessions: Map<string, Session>): string {
  return [...sessions].find(([, value]) => value === session)?.[0] ?? "closed";
}
function callback<T>(
  invoke: (done: (error?: Error | null, value?: T) => void) => void,
  error: DomainError,
): Promise<T> {
  return new Promise((resolve, reject) => invoke((failure, value) => {
    if (failure) reject(error);
    else resolve(value as T);
  }));
}
function sessionNotFound() { return new DomainError("SFTP_SESSION_NOT_FOUND", "The SFTP session is unavailable."); }
function notConnected(message: string) { return new DomainError("SFTP_NOT_CONNECTED", message); }
function notFound(message: string) { return new DomainError("SFTP_NOT_FOUND", message); }
function transferFailed() { return new DomainError("SFTP_TRANSFER_FAILED", "The file transfer failed."); }
function transferNotFound() { return new DomainError("SFTP_TRANSFER_NOT_FOUND", "The transfer is no longer active."); }
function watcherNotFound() { return new DomainError("SFTP_WATCHER_NOT_FOUND", "The open-with watcher is unavailable."); }
function invalidPath() { return new DomainError("SFTP_PATH_INVALID", "The requested path is not allowed."); }
function launchFailed() { return new DomainError("SFTP_LAUNCH_FAILED", "The application could not be opened."); }
