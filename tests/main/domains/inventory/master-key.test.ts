import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KeyProtector } from "../../../../src/main/domains/inventory/master-key";
import { loadOrCreateMasterKey } from "../../../../src/main/domains/inventory/master-key";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron master key storage", () => {
  it("creates an app-protected key and reopens the same key", async () => {
    const keyPath = temporaryKeyPath();
    const generated = Buffer.alloc(32, 0x5a);
    const protector = new TestProtector();

    const created = await loadOrCreateMasterKey({
      keyPath,
      databaseExists: false,
      protector,
      generateKey: () => Buffer.from(generated),
    });
    const reopened = await loadOrCreateMasterKey({
      keyPath,
      databaseExists: true,
      protector,
    });

    expect(created).toEqual(generated);
    expect(reopened).toEqual(generated);
    expect(readFileSync(keyPath).includes(generated)).toBe(false);
  });

  it("fails closed instead of replacing a missing key for an existing database", async () => {
    await expect(loadOrCreateMasterKey({
      keyPath: temporaryKeyPath(),
      databaseExists: true,
      protector: new TestProtector(),
    })).rejects.toMatchObject({ code: "VAULT_KEY_UNAVAILABLE" });
  });

  it("fails closed when app protection is unavailable", async () => {
    const protector = new TestProtector();
    protector.available = false;

    await expect(loadOrCreateMasterKey({
      keyPath: temporaryKeyPath(),
      databaseExists: false,
      protector,
    })).rejects.toMatchObject({ code: "VAULT_KEY_UNAVAILABLE" });
  });
});

class TestProtector implements KeyProtector {
  available = true;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async encrypt(value: string): Promise<Buffer> {
    return Buffer.from(`protected:${value}`, "utf8");
  }

  async decrypt(value: Buffer): Promise<string> {
    const encoded = value.toString("utf8");
    if (!encoded.startsWith("protected:")) throw new Error("Invalid protected value.");
    return encoded.slice("protected:".length);
  }
}

function temporaryKeyPath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-key-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "master-key.bin");
}
