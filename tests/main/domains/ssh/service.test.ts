import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSshPersistence } from "../../../../src/main/domains/ssh/service";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Electron SSH persistence lifecycle", () => {
  it("persists credentials with app-local encryption", async () => {
    const directory = temporaryDirectory();
    const first = await openSshPersistence(directory);
    const reference = await first.credentials.put({
      type: "password",
      password: "app-encrypted-secret",
    });
    first.close();

    const reopened = await openSshPersistence(directory);
    await expect(reopened.credentials.get(reference)).resolves.toEqual({
      type: "password",
      password: "app-encrypted-secret",
    });
    reopened.close();
  });

  it("shares the E2E key and database for trusted hosts", async () => {
    const directory = temporaryDirectory();
    const publicKey = wireKey("ssh-ed25519", "host-key");
    const first = await openSshPersistence(directory, true);
    first.knownHosts.trust("host", 22, publicKey);
    const credentialRef = await first.credentials.put({
      type: "password",
      password: "isolated-test-only",
    });
    await expect(first.credentials.get(credentialRef)).resolves.toMatchObject({
      type: "password",
    });
    first.close();

    const reopened = await openSshPersistence(directory, true);
    expect(reopened.knownHosts.check("host", 22, publicKey)).toEqual({ type: "trusted" });
    reopened.close();
  });
});

function wireKey(algorithm: string, body: string): Buffer {
  const name = Buffer.from(algorithm);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(name.length);
  return Buffer.concat([length, name, Buffer.from(body)]);
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-ssh-service-"));
  directories.push(directory);
  return directory;
}
