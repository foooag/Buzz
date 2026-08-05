import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppEncryptionProtector } from "./app-encryption";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("app-local encryption", () => {
  it("creates a private app key and reopens protected data without OS services", async () => {
    const directory = temporaryDirectory();
    const first = await AppEncryptionProtector.open(directory, false);
    const encrypted = await first.encrypt("local secret");
    first.dispose();

    expect(encrypted.includes(Buffer.from("local secret"))).toBe(false);
    const keyPath = path.join(directory, "app-encryption.key");
    expect(readFileSync(keyPath)).toHaveLength(33);
    if (process.platform !== "win32") {
      expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    }

    const reopened = await AppEncryptionProtector.open(directory, true);
    await expect(reopened.decrypt(encrypted)).resolves.toBe("local secret");
    reopened.dispose();
  });

  it("rejects tampered ciphertext and a missing key for existing data", async () => {
    const directory = temporaryDirectory();
    const protector = await AppEncryptionProtector.open(directory, false);
    const encrypted = await protector.encrypt("secret");
    encrypted[encrypted.length - 1] ^= 0xff;
    await expect(protector.decrypt(encrypted)).rejects.toMatchObject({
      code: "VAULT_KEY_UNAVAILABLE",
    });
    protector.dispose();

    rmSync(path.join(directory, "app-encryption.key"));
    writeFileSync(path.join(directory, "inventory.sqlite3"), "existing");
    await expect(AppEncryptionProtector.open(directory, true)).rejects.toMatchObject({
      code: "VAULT_KEY_UNAVAILABLE",
    });
  });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-app-encryption-"));
  directories.push(directory);
  return directory;
}
