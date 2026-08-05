import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KeyProtector } from "../inventory/master-key";
import {
  decodeCredential,
  encodeCredential,
  ProtectedFileCredentialVault,
  type SshCredential,
} from "./credential-vault";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe("Electron SSH credential vault", () => {
  it("matches the Rust password and private-key envelope contract", () => {
    expect(encodeCredential({ type: "password", password: "secret" })).toEqual(
      Buffer.from([1, 1, ...Buffer.from("secret")]),
    );
    const original: SshCredential = {
      type: "privateKey",
      privateKey: Buffer.from("PRIVATE KEY"),
      passphrase: "phrase",
    };
    const encoded = encodeCredential(original);
    expect(encoded.subarray(0, 6)).toEqual(Buffer.from([1, 2, 0, 0, 0, 11]));
    expect(decodeCredential(encoded)).toEqual(original);
  });

  it("persists only protected bytes and reopens by opaque reference", async () => {
    const directory = temporaryDirectory();
    const protector = new XorProtector();
    const first = new ProtectedFileCredentialVault(directory, protector);
    const reference = await first.put({ type: "password", password: "never-in-file" });
    const stored = readFileSync(path.join(directory, `${reference}.credential`));
    expect(stored.includes(Buffer.from("never-in-file"))).toBe(false);

    const reopened = new ProtectedFileCredentialVault(directory, protector);
    await expect(reopened.get(reference)).resolves.toEqual({
      type: "password",
      password: "never-in-file",
    });
    await reopened.delete(reference);
    await expect(reopened.get(reference)).rejects.toMatchObject({
      code: "SSH_CREDENTIAL_UNAVAILABLE",
    });
  });

  it("rejects path-like credential references", async () => {
    const vault = new ProtectedFileCredentialVault(temporaryDirectory(), new XorProtector());
    await expect(vault.get("../../master-key.bin")).rejects.toMatchObject({
      code: "SSH_CREDENTIAL_UNAVAILABLE",
    });
  });
});

class XorProtector implements KeyProtector {
  async isAvailable() { return true; }
  async encrypt(value: string) { return xor(Buffer.from(value)); }
  async decrypt(value: Buffer) { return xor(value).toString(); }
}

function xor(value: Buffer): Buffer {
  return Buffer.from(value.map((byte) => byte ^ 0xa5));
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-ssh-credentials-"));
  directories.push(directory);
  return directory;
}
