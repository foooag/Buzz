import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { quote } from "shell-quote";
import type {
  Client,
  ClientChannel,
  ConnectConfig,
  ParsedKey,
} from "ssh2";
import { DomainError } from "../../ipc/domain-error.js";
import type { TerminalSize } from "../terminal/runtime.js";
import { validateSize } from "../terminal/runtime.js";
import type { SshCredential, SshCredentialVault } from "./credential-vault.js";
import { KnownHostsRepository } from "./known-hosts.js";

export type SshAuthKind = "password" | "privateKey";

export type CreateSshProfile = {
  hostId: string;
  hostname: string;
  port?: number | null;
  username: string;
  authKind: SshAuthKind;
  credentialRef: string;
  identityId?: string | null;
  keepaliveInterval?: number | null;
};

type SshProfile = CreateSshProfile & {
  port: number;
  keepaliveInterval: number | null;
};

type TerminalEvent = Record<string, unknown> & { type: string; sessionId: string };

export type SshBindings = {
  createClient(): Client;
  parseKey(data: Buffer, passphrase?: string): ParsedKey | Error;
};

type Session = {
  client: Client;
  channel: ClientChannel;
  profile: SshProfile;
  size: TerminalSize;
  streamId?: string;
  closed: boolean;
};

export type SshCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
};

type PendingDecision = {
  hostname: string;
  port: number;
  publicKey: Buffer;
  verify(trust: boolean): void;
  timeout: ReturnType<typeof setTimeout>;
  streamId?: string;
};

export class SshRuntime {
  readonly #credentials: SshCredentialVault;
  readonly #knownHosts: KnownHostsRepository;
  readonly #emit: (streamId: string | undefined, event: TerminalEvent) => void;
  readonly #bindings: SshBindings;
  readonly #sessions = new Map<string, Session>();
  readonly #pending = new Map<string, PendingDecision>();

  constructor(
    credentials: SshCredentialVault,
    knownHosts: KnownHostsRepository,
    emit: (streamId: string | undefined, event: TerminalEvent) => void,
    bindings: SshBindings = loadSshBindings(),
  ) {
    this.#credentials = credentials;
    this.#knownHosts = knownHosts;
    this.#emit = emit;
    this.#bindings = bindings;
  }

  async storeCredential(credential: SshCredential): Promise<string> {
    return this.#credentials.put(credential);
  }

  async open(
    input: CreateSshProfile,
    size: TerminalSize,
    streamId?: string,
  ): Promise<{ sessionId: string; title: string }> {
    const profile = normalizeProfile(input);
    validateSize(size);
    const sessionId = randomUUID();
    const client = await this.connectClient(profile, sessionId, streamId);
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      client.shell(
        { term: "xterm-256color", cols: size.cols, rows: size.rows, width: 0, height: 0 },
        (error, openedChannel) => {
          if (error) reject(channelError());
          else resolve(openedChannel);
        },
      );
    }).catch((error) => {
      client.end();
      throw error;
    });
    const session: Session = {
      client,
      channel,
      profile,
      size,
      streamId,
      closed: false,
    };
    this.#sessions.set(sessionId, session);
    this.#observeChannel(sessionId, session);
    this.#state(streamId, sessionId, "connected");
    return { sessionId, title: profile.hostname };
  }

  async connectClient(
    input: CreateSshProfile,
    connectionId: string,
    streamId?: string,
  ): Promise<Client> {
    const profile = normalizeProfile(input);
    const credential = await this.#credentials.get(profile.credentialRef);
    const auth = this.#authentication(profile, credential);
    const clearPrivateKey = () => {
      if (Buffer.isBuffer(auth.privateKey)) auth.privateKey.fill(0);
    };
    const client = this.#bindings.createClient();
    this.#state(streamId, connectionId, "connecting");

    return new Promise((resolve, reject) => {
      let settled = false;
      let authenticationStarted = false;
      const authenticate = () => {
        if (authenticationStarted) return;
        authenticationStarted = true;
        this.#state(streamId, connectionId, "authenticating");
      };
      const fail = (error: DomainError) => {
        clearPrivateKey();
        this.#clearPending(connectionId, false);
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      client.on("ready", () => {
        clearPrivateKey();
        settled = true;
        resolve(client);
      });
      client.on("error", (error) => {
        const authenticationFailure = error.level === "client-authentication";
        fail(authenticationFailure ? authenticationError() : connectionError());
      });
      client.on("close", () => {
        if (!settled) fail(connectionError());
      });

      const config: ConnectConfig = {
        host: profile.hostname,
        port: profile.port,
        username: profile.username,
        readyTimeout: 30_000,
        keepaliveInterval: profile.keepaliveInterval
          ? profile.keepaliveInterval * 1000
          : 0,
        ...auth,
        hostVerifier: (publicKey: Buffer, verify: (valid: boolean) => void) => {
          let status;
          try {
            status = this.#knownHosts.check(profile.hostname, profile.port, publicKey);
          } catch {
            verify(false);
            return;
          }
          if (status.type === "trusted") {
            authenticate();
            verify(true);
            return;
          }
          if (status.type === "changed") {
            this.#emit(streamId, {
              type: "error",
              sessionId: connectionId,
              error: {
                code: "HOST_KEY_CHANGED",
                message: "The SSH host key changed. The connection was blocked.",
              },
            });
            verify(false);
            return;
          }
          this.#state(streamId, connectionId, "verifyingHostKey");
          const timeout = setTimeout(() => this.#clearPending(connectionId, false), 30_000);
          timeout.unref();
          this.#pending.set(connectionId, {
            hostname: profile.hostname,
            port: profile.port,
            publicKey: Buffer.from(publicKey),
            verify: (trust) => {
              if (trust) authenticate();
              verify(trust);
            },
            timeout,
            streamId,
          });
          this.#emit(streamId, {
            type: "hostKeyVerificationRequired",
            sessionId: connectionId,
            host: profile.hostname,
            port: profile.port,
            algorithm: status.algorithm,
            fingerprint: status.fingerprint,
          });
        },
      };

      try {
        client.connect(config);
      } catch {
        fail(connectionError());
      }
    });
  }

  decideHostKey(sessionId: string, trust: boolean): void {
    const pending = this.#pending.get(sessionId);
    if (!pending) throw sessionNotFound();
    this.#pending.delete(sessionId);
    clearTimeout(pending.timeout);
    let accepted = trust;
    if (trust) {
      try {
        this.#knownHosts.trust(pending.hostname, pending.port, pending.publicKey);
      } catch {
        accepted = false;
      }
    }
    pending.publicKey.fill(0);
    pending.verify(accepted);
  }

  async reconnect(sessionId: string): Promise<{ sessionId: string; title: string }> {
    const session = this.#sessions.get(sessionId);
    if (!session) throw sessionNotFound();
    const { profile, size, streamId } = session;
    this.#state(streamId, sessionId, "reconnecting");
    await this.close(sessionId);
    return this.open(profile, size, streamId);
  }

  has(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  host(sessionId: string): string {
    return this.#session(sessionId).profile.hostname;
  }

  hostId(sessionId: string): string {
    return this.#session(sessionId).profile.hostId;
  }

  async executeCommand(
    sessionId: string,
    cwd: string,
    command: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<SshCommandResult> {
    const session = this.#session(sessionId);
    return executeOnClientWithEvents(
      session.client,
      command,
      { cwd, timeoutMs, signal },
      () => this.#emit(session.streamId, {
        type: "output",
        sessionId,
        data: Array.from(Buffer.from(`\r\n$ ${command}\r\n`)),
      }),
      (chunk) => this.#emit(session.streamId, {
        type: "output",
        sessionId,
        data: Array.from(chunk),
      }),
    );
  }

  async write(sessionId: string, data: readonly number[]): Promise<void> {
    const session = this.#session(sessionId);
    await new Promise<void>((resolve, reject) => {
      session.channel.write(Buffer.from(data), (error) => {
        if (error) reject(disconnectedError());
        else resolve();
      });
    });
  }

  async resize(sessionId: string, size: TerminalSize): Promise<void> {
    validateSize(size);
    const session = this.#session(sessionId);
    try {
      session.channel.setWindow(size.rows, size.cols, 0, 0);
      session.size = size;
    } catch {
      throw disconnectedError();
    }
  }

  async close(sessionId: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    this.#sessions.delete(sessionId);
    session.closed = true;
    try {
      session.channel.close();
    } finally {
      session.client.end();
    }
  }

  async closeAll(): Promise<void> {
    for (const sessionId of [...this.#pending.keys()]) this.#clearPending(sessionId, false);
    await Promise.all([...this.#sessions.keys()].map((sessionId) => this.close(sessionId)));
  }

  #authentication(
    profile: SshProfile,
    credential: SshCredential,
  ): Pick<ConnectConfig, "password" | "privateKey" | "passphrase"> {
    if (profile.authKind === "password" && credential.type === "password") {
      return { password: credential.password };
    }
    if (profile.authKind === "privateKey" && credential.type === "privateKey") {
      const parsed = this.#bindings.parseKey(
        credential.privateKey,
        credential.passphrase ?? undefined,
      );
      if (parsed instanceof Error) throw privateKeyError();
      const privateKey = Buffer.from(credential.privateKey);
      credential.privateKey.fill(0);
      return {
        privateKey,
        ...(credential.passphrase === null ? {} : { passphrase: credential.passphrase }),
      };
    }
    if (credential.type === "privateKey") credential.privateKey.fill(0);
    throw authenticationError();
  }

  #observeChannel(sessionId: string, session: Session): void {
    const output = (data: Buffer | string) => this.#emit(session.streamId, {
      type: "output",
      sessionId,
      data: Array.from(Buffer.isBuffer(data) ? data : Buffer.from(data)),
    });
    session.channel.on("data", output);
    session.channel.stderr.on("data", output);
    session.channel.on("exit", (exitCode: number | null) => this.#emit(session.streamId, {
      type: "exit",
      sessionId,
      exitCode: typeof exitCode === "number" && exitCode >= 0 ? exitCode : null,
    }));
    session.channel.on("close", () => {
      if (!session.closed) this.#sessions.delete(sessionId);
      this.#state(session.streamId, sessionId, "disconnected");
      this.#emit(session.streamId, { type: "reconnectAvailable", sessionId });
    });
  }

  #state(streamId: string | undefined, sessionId: string, state: string): void {
    this.#emit(streamId, { type: "connectionStateChanged", sessionId, state });
  }

  #session(sessionId: string): Session {
    const session = this.#sessions.get(sessionId);
    if (!session) throw sessionNotFound();
    return session;
  }

  #clearPending(sessionId: string, trust: boolean): void {
    const pending = this.#pending.get(sessionId);
    if (!pending) return;
    this.#pending.delete(sessionId);
    clearTimeout(pending.timeout);
    pending.publicKey.fill(0);
    pending.verify(trust);
  }
}

export async function executeOnClient(
  client: Client,
  command: string,
  opts: { cwd?: string; timeoutMs: number; signal?: AbortSignal },
): Promise<SshCommandResult> {
  return executeOnClientWithEvents(client, command, opts, () => undefined, () => undefined);
}

async function executeOnClientWithEvents(
  client: Client,
  command: string,
  opts: { cwd?: string; timeoutMs: number; signal?: AbortSignal },
  announce: (command: string) => void,
  emitOutput: (chunk: Buffer) => void,
): Promise<SshCommandResult> {
  if (opts.signal?.aborted) throw commandAbortedError();
  const boundedTimeout = Math.min(300_000, Math.max(1_000, opts.timeoutMs));
  const cwd = opts.cwd?.trim() || "$HOME";
  const cwdExpression = cwd === "$HOME" ? "$HOME" : quote([cwd]);
  const remoteCommand = `cd -- ${cwdExpression} && ${command}`;
  announce(remoteCommand);
  const channel = await new Promise<ClientChannel>((resolve, reject) => {
    client.exec(remoteCommand, (error, opened) => {
      if (error) reject(disconnectedError());
      else resolve(opened);
    });
  });
  if (opts.signal?.aborted) {
    channel.close();
    throw commandAbortedError();
  }
  return await new Promise<SshCommandResult>((resolve, reject) => {
    const limit = 1024 * 1024;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let truncated = false;
    let exitCode: number | null = null;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      channel.signal("INT");
      channel.close();
      reject(commandAbortedError());
    };
    const append = (target: Buffer[], data: Buffer | string) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const remaining = Math.max(0, limit - bytes);
      if (remaining > 0) target.push(chunk.subarray(0, remaining));
      if (chunk.byteLength > remaining) truncated = true;
      bytes += Math.min(chunk.byteLength, remaining);
      emitOutput(chunk);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      channel.signal("INT");
      channel.close();
      reject(new DomainError("AI_TIMEOUT", "The SSH command timed out."));
    }, boundedTimeout);
    timer.unref();
    opts.signal?.addEventListener("abort", abort, { once: true });
    channel.on("data", (data: Buffer | string) => append(stdout, data));
    channel.stderr.on("data", (data: Buffer | string) => append(stderr, data));
    channel.on("exit", (code: number | null) => {
      exitCode = typeof code === "number" && code >= 0 ? code : null;
    });
    channel.on("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(disconnectedError());
    });
    channel.on("close", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode,
        truncated,
      });
    });
  });
}

function commandAbortedError(): DomainError {
  return new DomainError("AI_ABORTED", "The SSH command was cancelled.");
}

function normalizeProfile(input: CreateSshProfile): SshProfile {
  const hostId = input.hostId.trim();
  const hostname = input.hostname.trim();
  const username = input.username.trim();
  const credentialRef = input.credentialRef.trim();
  const port = input.port ?? 22;
  const keepalive = input.keepaliveInterval ?? null;
  if (
    !hostId || !hostname || !username || !credentialRef ||
    !Number.isInteger(port) || port < 1 || port > 65_535 ||
    (keepalive !== null && (!Number.isInteger(keepalive) || keepalive < 0 || keepalive > 600))
  ) throw profileError();
  return {
    ...input,
    hostId,
    hostname,
    username,
    credentialRef,
    port,
    identityId: input.identityId?.trim() || null,
    keepaliveInterval: keepalive && keepalive > 0 ? keepalive : null,
  };
}

function loadSshBindings(): SshBindings {
  const ssh2 = createRequire(import.meta.url)("ssh2") as typeof import("ssh2");
  return {
    createClient: () => new ssh2.Client(),
    parseKey: ssh2.utils.parseKey,
  };
}

function profileError() {
  return new DomainError("SSH_PROFILE_INVALID", "The SSH connection profile is invalid.");
}
function privateKeyError() {
  return new DomainError(
    "SSH_PRIVATE_KEY_INVALID",
    "The SSH private key or passphrase is invalid.",
  );
}
function connectionError() {
  return new DomainError("SSH_CONNECTION_FAILED", "The SSH server could not be reached.");
}
function authenticationError() {
  return new DomainError("SSH_AUTHENTICATION_FAILED", "SSH authentication failed.");
}
function channelError() {
  return new DomainError("SSH_CHANNEL_FAILED", "The SSH terminal channel could not be opened.");
}
function disconnectedError() {
  return new DomainError("SSH_DISCONNECTED", "The SSH session is disconnected.");
}
function sessionNotFound() {
  return new DomainError("SESSION_NOT_FOUND", "The terminal session is no longer available.");
}
