import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client, ClientChannel, ConnectConfig, ParsedKey } from "ssh2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openInventoryDatabase } from "../../../../electron/domains/inventory/database";
import { AesGcmFieldCipher } from "../../../../electron/domains/inventory/field-cipher";
import { MemorySshCredentialVault } from "../../../../electron/domains/ssh/credential-vault";
import { KnownHostsRepository } from "../../../../electron/domains/ssh/known-hosts";
import { SshRuntime, type SshBindings } from "../../../../electron/domains/ssh/runtime";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Electron SSH runtime", () => {
  it("prompts for an unknown key, connects, streams, resizes and closes", async () => {
    const credentialVault = new MemorySshCredentialVault();
    const credentialRef = await credentialVault.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    const client = new FakeClient(wireKey("ssh-ed25519", "server-key"));
    const emit = vi.fn();
    const runtime = new SshRuntime(
      credentialVault,
      knownHosts,
      emit,
      bindings([client]),
    );

    const opening = runtime.open(profile(credentialRef), { cols: 80, rows: 24 }, "stream-1");
    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(
      "stream-1",
      expect.objectContaining({ type: "hostKeyVerificationRequired" }),
    ));
    const prompt = emit.mock.calls.find(([, event]) => event.type === "hostKeyVerificationRequired")
      ?.[1] as { sessionId: string; fingerprint: string };
    expect(prompt.fingerprint).toMatch(/^SHA256:/);
    runtime.decideHostKey(prompt.sessionId, true);

    const opened = await opening;
    expect(opened).toEqual({ sessionId: prompt.sessionId, title: "ssh.example.test" });
    expect(runtime.has(opened.sessionId)).toBe(true);
    expect(emit.mock.calls.map(([, event]) => event.type)).toEqual(expect.arrayContaining([
      "connectionStateChanged",
      "hostKeyVerificationRequired",
    ]));

    client.channel.emit("data", Buffer.from([0, 27, 255]));
    expect(emit).toHaveBeenCalledWith("stream-1", {
      type: "output",
      sessionId: opened.sessionId,
      data: [0, 27, 255],
    });
    await runtime.write(opened.sessionId, [65, 0]);
    expect(client.channel.writeBytes).toHaveBeenCalledWith(Buffer.from([65, 0]));
    await runtime.resize(opened.sessionId, { cols: 120, rows: 40 });
    expect(client.channel.setWindow).toHaveBeenCalledWith(40, 120, 0, 0);
    await runtime.close(opened.sessionId);
    expect(client.channel.close).toHaveBeenCalledOnce();
    expect(client.end).toHaveBeenCalledOnce();
    knownHosts.close();
  });

  it("does not prompt again after the host key is trusted", async () => {
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    const key = wireKey("ssh-ed25519", "stable-key");
    knownHosts.trust("ssh.example.test", 22, key);
    const client = new FakeClient(key);
    const emit = vi.fn();
    const runtime = new SshRuntime(credentials, knownHosts, emit, bindings([client]));

    await expect(runtime.open(profile(credentialRef), { cols: 80, rows: 24 }))
      .resolves.toMatchObject({ title: "ssh.example.test" });
    expect(emit.mock.calls.some(([, event]) => event.type === "hostKeyVerificationRequired"))
      .toBe(false);
    await runtime.closeAll();
    knownHosts.close();
  });

  it("blocks changed keys and returns only the sanitized connection error", async () => {
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    knownHosts.trust("ssh.example.test", 22, wireKey("ssh-ed25519", "old-key"));
    const emit = vi.fn();
    const client = new FakeClient(wireKey("ssh-ed25519", "changed-key"));
    const runtime = new SshRuntime(credentials, knownHosts, emit, bindings([client]));

    await expect(runtime.open(profile(credentialRef), { cols: 80, rows: 24 }))
      .rejects.toMatchObject({
        code: "SSH_CONNECTION_FAILED",
        message: "The SSH server could not be reached.",
      });
    expect(emit).toHaveBeenCalledWith(undefined, expect.objectContaining({
      type: "error",
      error: expect.objectContaining({ code: "HOST_KEY_CHANGED" }),
    }));
    knownHosts.close();
  });

  it("rejects mismatched credential kinds before opening a socket", async () => {
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    const client = new FakeClient(wireKey("ssh-ed25519", "key"));
    const runtime = new SshRuntime(credentials, knownHosts, vi.fn(), bindings([client]));

    await expect(runtime.open(
      { ...profile(credentialRef), authKind: "privateKey" },
      { cols: 80, rows: 24 },
    )).rejects.toMatchObject({ code: "SSH_AUTHENTICATION_FAILED" });
    expect(client.connectConfig).toBeUndefined();
    knownHosts.close();
  });

  it("executes an AI side-channel command on the active SSH connection", async () => {
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    const key = wireKey("ssh-ed25519", "command-key");
    knownHosts.trust("ssh.example.test", 22, key);
    const client = new FakeClient(key);
    const emit = vi.fn();
    const runtime = new SshRuntime(credentials, knownHosts, emit, bindings([client]));
    const opened = await runtime.open(profile(credentialRef), { cols: 80, rows: 24 }, "stream");

    const execution = runtime.executeCommand(opened.sessionId, "/tmp/a b", "printf ok", 5_000);
    await Promise.resolve();
    client.commandChannel.emit("data", Buffer.from("ok"));
    client.commandChannel.stderr.emit("data", Buffer.from("warning"));
    client.commandChannel.emit("exit", 0);
    client.commandChannel.emit("close");

    await expect(execution).resolves.toEqual({
      stdout: "ok", stderr: "warning", exitCode: 0, truncated: false,
    });
    expect(client.execCommand).toBe("cd -- '/tmp/a b' && printf ok");
    expect(emit).toHaveBeenCalledWith("stream", expect.objectContaining({
      type: "output", sessionId: opened.sessionId,
    }));
    await runtime.closeAll();
    knownHosts.close();
  });

  it("preserves remote HOME expansion for the AI tool default CWD", async () => {
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    const key = wireKey("ssh-ed25519", "home-key");
    knownHosts.trust("ssh.example.test", 22, key);
    const client = new FakeClient(key);
    const runtime = new SshRuntime(credentials, knownHosts, vi.fn(), bindings([client]));
    const opened = await runtime.open(profile(credentialRef), { cols: 80, rows: 24 });

    const execution = runtime.executeCommand(opened.sessionId, "$HOME", "pwd", 5_000);
    await Promise.resolve();
    client.commandChannel.emit("exit", 0);
    client.commandChannel.emit("close");
    await execution;
    expect(client.execCommand).toBe("cd -- $HOME && pwd");
    await runtime.closeAll();
    knownHosts.close();
  });

  it("interrupts an active AI side-channel command when its Agent aborts", async () => {
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({ type: "password", password: "secret" });
    const knownHosts = knownHostsRepository();
    const key = wireKey("ssh-ed25519", "abort-key");
    knownHosts.trust("ssh.example.test", 22, key);
    const client = new FakeClient(key);
    const runtime = new SshRuntime(credentials, knownHosts, vi.fn(), bindings([client]));
    const opened = await runtime.open(profile(credentialRef), { cols: 80, rows: 24 });
    const controller = new AbortController();
    const execution = runtime.executeCommand(
      opened.sessionId,
      "$HOME",
      "sleep 30",
      60_000,
      controller.signal,
    );
    await Promise.resolve();

    controller.abort();

    await expect(execution).rejects.toMatchObject({ code: "AI_ABORTED" });
    expect(client.commandChannel.signal).toHaveBeenCalledWith("INT");
    expect(client.commandChannel.close).toHaveBeenCalledOnce();
    await runtime.closeAll();
    knownHosts.close();
  });
});

class FakeChannel extends EventEmitter {
  readonly writeBytes = vi.fn();
  readonly setWindow = vi.fn();
  readonly close = vi.fn(() => this.emit("close"));
  readonly signal = vi.fn();
  readonly stderr = new EventEmitter();

  write(data: Buffer, callback: (error?: Error | null) => void): boolean {
    this.writeBytes(data);
    callback(null);
    return true;
  }
}

class FakeClient extends EventEmitter {
  readonly channel = new FakeChannel();
  readonly commandChannel = new FakeChannel();
  readonly end = vi.fn();
  connectConfig?: ConnectConfig;
  readonly #key: Buffer;
  execCommand?: string;

  constructor(key: Buffer) {
    super();
    this.#key = key;
  }

  connect(config: ConnectConfig): this {
    this.connectConfig = config;
    const verifier = config.hostVerifier as (key: Buffer, verify: (valid: boolean) => void) => void;
    verifier(this.#key, (valid) => {
      if (valid) this.emit("ready");
      else this.emit("error", Object.assign(new Error("private native error"), {
        level: "client-ssh",
      }));
    });
    return this;
  }

  shell(_window: unknown, callback: (error: Error | undefined, channel: ClientChannel) => void) {
    callback(undefined, this.channel as unknown as ClientChannel);
    return this;
  }

  exec(command: string, callback: (error: Error | undefined, channel: ClientChannel) => void) {
    this.execCommand = command;
    callback(undefined, this.commandChannel as unknown as ClientChannel);
    return this;
  }
}

function bindings(clients: FakeClient[]): SshBindings {
  return {
    createClient: () => clients.shift() as unknown as Client,
    parseKey: () => ({ type: "ssh-ed25519" }) as unknown as ParsedKey,
  };
}

function profile(credentialRef: string) {
  return {
    hostId: "host-1",
    hostname: "ssh.example.test",
    port: 22,
    username: "tester",
    authKind: "password" as const,
    credentialRef,
    identityId: null,
    keepaliveInterval: null,
  };
}

function knownHostsRepository(): KnownHostsRepository {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-ssh-runtime-"));
  directories.push(directory);
  return new KnownHostsRepository(
    openInventoryDatabase(path.join(directory, "inventory.sqlite3")),
    new AesGcmFieldCipher(Buffer.alloc(32, 0x52)),
  );
}

function wireKey(algorithm: string, body: string): Buffer {
  const name = Buffer.from(algorithm);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(name.length);
  return Buffer.concat([length, name, Buffer.from(body)]);
}
