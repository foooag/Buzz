import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openInventoryDatabase } from "../inventory/database";
import { AesGcmFieldCipher } from "../inventory/field-cipher";
import { inspectPublicKey, KnownHostsRepository } from "./known-hosts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Electron known-hosts repository", () => {
  it("prompts once, persists trust, normalizes hostnames and lists safe metadata", () => {
    const { repository, databasePath } = openRepository();
    const key = wireKey("ssh-ed25519", Buffer.from("first-public-key"));
    expect(repository.check("SSH.Example.Test.", 22, key)).toMatchObject({
      type: "unknown",
      algorithm: "ssh-ed25519",
      fingerprint: expect.stringMatching(/^SHA256:/),
    });
    repository.trust("SSH.Example.Test.", 22, key);
    expect(repository.check("ssh.example.test", 22, key)).toEqual({ type: "trusted" });
    expect(repository.list()).toMatchObject([{
      hostname: "ssh.example.test",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: inspectPublicKey(key).fingerprint,
    }]);
    repository.close();

    const databaseBytes = readFileSync(databasePath);
    expect(databaseBytes.includes(Buffer.from(key.toString("base64")))).toBe(false);
  });

  it("blocks a changed key while exposing fingerprints rather than raw keys", () => {
    const { repository } = openRepository();
    const first = wireKey("ssh-ed25519", Buffer.from("first"));
    const changed = wireKey("ssh-ed25519", Buffer.from("changed"));
    repository.trust("host", 2222, first);

    expect(repository.check("host", 2222, changed)).toEqual({
      type: "changed",
      expected: inspectPublicKey(first).fingerprint,
      presented: inspectPublicKey(changed).fingerprint,
    });
    repository.remove("host", 2222);
    expect(repository.list()).toEqual([]);
    repository.close();
  });

  it("reopens Rust-compatible encrypted trusted-host records", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "inventory.sqlite3");
    const key = wireKey("ssh-rsa", Buffer.from("rsa-key"));
    const first = new KnownHostsRepository(
      openInventoryDatabase(databasePath),
      new AesGcmFieldCipher(Buffer.alloc(32, 0x31)),
    );
    first.trust("host", 22, key);
    first.close();

    const reopened = new KnownHostsRepository(
      openInventoryDatabase(databasePath),
      new AesGcmFieldCipher(Buffer.alloc(32, 0x31)),
    );
    expect(reopened.check("host", 22, key)).toEqual({ type: "trusted" });
    reopened.close();
  });
});

function openRepository() {
  const directory = temporaryDirectory();
  const databasePath = path.join(directory, "inventory.sqlite3");
  return {
    databasePath,
    repository: new KnownHostsRepository(
      openInventoryDatabase(databasePath),
      new AesGcmFieldCipher(Buffer.alloc(32, 0x31)),
    ),
  };
}

function wireKey(algorithm: string, body: Buffer): Buffer {
  const name = Buffer.from(algorithm, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(name.byteLength);
  return Buffer.concat([length, name, body]);
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-known-hosts-"));
  directories.push(directory);
  return directory;
}
