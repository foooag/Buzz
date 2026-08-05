import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, type Connection, type ServerChannel } from "ssh2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openInventoryDatabase } from "../../../../electron/domains/inventory/database";
import { AesGcmFieldCipher } from "../../../../electron/domains/inventory/field-cipher";
import { MemorySshCredentialVault } from "../../../../electron/domains/ssh/credential-vault";
import { KnownHostsRepository } from "../../../../electron/domains/ssh/known-hosts";
import { SshRuntime } from "../../../../electron/domains/ssh/runtime";

const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("ssh2 runtime integration", () => {
  it("performs a real verified password handshake and PTY round trip", async () => {
    const server = await startServer("correct-password");
    cleanup.push(server.close);
    const directory = mkdtempSync(path.join(tmpdir(), "terminus-ssh2-integration-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const knownHosts = new KnownHostsRepository(
      openInventoryDatabase(path.join(directory, "inventory.sqlite3")),
      new AesGcmFieldCipher(Buffer.alloc(32, 0x63)),
    );
    cleanup.push(() => knownHosts.close());
    const credentials = new MemorySshCredentialVault();
    const credentialRef = await credentials.put({
      type: "password",
      password: "correct-password",
    });
    const events: Array<Record<string, unknown>> = [];
    const runtime = new SshRuntime(credentials, knownHosts, (_streamId, event) => {
      events.push(event);
    });
    cleanup.push(() => runtime.closeAll());

    const opening = runtime.open({
      hostId: "integration-host",
      hostname: "127.0.0.1",
      port: server.port,
      username: "tester",
      authKind: "password",
      credentialRef,
      identityId: null,
      keepaliveInterval: null,
    }, { cols: 80, rows: 24 }, "integration-stream");

    await vi.waitFor(() => expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "hostKeyVerificationRequired" }),
    ])));
    const prompt = events.find((event) => event.type === "hostKeyVerificationRequired") as {
      sessionId: string;
      fingerprint: string;
    };
    expect(prompt.fingerprint).toMatch(/^SHA256:/);
    runtime.decideHostKey(prompt.sessionId, true);
    const opened = await opening;

    await vi.waitFor(() => expect(output(events)).toContain("__SSH2_READY__"));
    await runtime.write(opened.sessionId, Array.from(Buffer.from("echo-marker\n")));
    await vi.waitFor(() => expect(output(events)).toContain("echo-marker"));
    await runtime.resize(opened.sessionId, { cols: 120, rows: 40 });
    await vi.waitFor(() => expect(server.sizes).toContainEqual([120, 40]));
    await runtime.close(opened.sessionId);
    expect(knownHosts.check("127.0.0.1", server.port, server.publicKey)).toEqual({
      type: "trusted",
    });
  }, 10_000);
});

async function startServer(password: string): Promise<{
  port: number;
  publicKey: Buffer;
  sizes: Array<[number, number]>;
  close(): Promise<void>;
}> {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const hostKey = privateKey.export({ type: "pkcs1", format: "pem" });
  const ssh2 = await import("ssh2");
  const parsed = ssh2.utils.parseKey(hostKey);
  if (parsed instanceof Error) throw parsed;
  const publicKey = parsed.getPublicSSH();
  const sizes: Array<[number, number]> = [];
  const clients = new Set<Connection>();
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    clients.add(client);
    client.on("authentication", (context) => {
      if (
        context.method === "password" &&
        context.username === "tester" &&
        context.password === password
      ) context.accept();
      else context.reject();
    });
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", (acceptPty, _reject, info) => {
          sizes.push([info.cols, info.rows]);
          acceptPty();
        });
        session.on("window-change", (acceptChange, _reject, info) => {
          sizes.push([info.cols, info.rows]);
          acceptChange?.();
        });
        session.on("shell", (acceptShell) => {
          const stream = acceptShell() as ServerChannel;
          stream.write("__SSH2_READY__\r\n");
          stream.on("data", (data: Buffer) => stream.write(data));
        });
      });
    });
    client.on("close", () => clients.delete(client));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SSH test server did not bind.");
  return {
    port: address.port,
    publicKey,
    sizes,
    close: async () => {
      for (const client of clients) client.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function output(events: Array<Record<string, unknown>>): string {
  const bytes = events.flatMap((event) => event.type === "output" && Array.isArray(event.data)
    ? event.data as number[]
    : []);
  return Buffer.from(bytes).toString();
}
