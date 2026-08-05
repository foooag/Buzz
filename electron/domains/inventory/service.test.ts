import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { KeyProtector } from "./master-key";
import { openE2eInventoryService, openInventoryService } from "./service";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron inventory service lifecycle", () => {
  it("persists encrypted inventory across a complete close and reopen", async () => {
    const directory = temporaryDirectory();
    const protector = new TestProtector();
    const first = await openInventoryService(directory, { protector });
    const vault = first.createVault({ name: "Persistent" });
    first.close();

    const reopened = await openInventoryService(directory, { protector });
    expect(reopened.listVaults()).toEqual([vault]);
    reopened.close();
  });

  it("fails closed instead of replacing a missing master key", async () => {
    const directory = temporaryDirectory();
    const protector = new TestProtector();
    const initial = await openInventoryService(directory, { protector });
    initial.createVault({ name: "Legacy-compatible" });
    initial.close();

    // Simulate a legacy database by removing only the new protected-key file.
    rmSync(path.join(directory, "master-key.bin"));
    await expect(openInventoryService(directory, { protector })).rejects.toMatchObject({
      code: "VAULT_KEY_UNAVAILABLE",
    });
  });

  it("uses the native-compatible database and key for isolated E2E data", () => {
    const directory = temporaryDirectory();
    const first = openE2eInventoryService(directory);
    const vault = first.createVault({ name: "E2E" });
    first.close();

    const reopened = openE2eInventoryService(directory);
    expect(reopened.listVaults()).toEqual([vault]);
    reopened.close();
    expect(() => rmSync(path.join(directory, "master-key.bin"))).toThrow();
  });
});

class TestProtector implements KeyProtector {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async encrypt(value: string): Promise<Buffer> {
    return Buffer.from(`protected:${value}`);
  }

  async decrypt(value: Buffer): Promise<string> {
    return value.toString().slice("protected:".length);
  }
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-service-"));
  temporaryDirectories.push(directory);
  return directory;
}
