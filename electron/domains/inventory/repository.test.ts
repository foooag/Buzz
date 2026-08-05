import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openInventoryDatabase } from "./database";
import { AesGcmFieldCipher } from "./field-cipher";
import { InventoryRepository } from "./repository";

const temporaryDirectories: string[] = [];
const key = Buffer.alloc(32, 0x31);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron encrypted inventory repository", () => {
  it("creates, lists, updates, and deletes vaults with conflict protection", () => {
    const { repository } = createRepository();
    const created = repository.createVault({ name: " Personal " });

    expect(repository.listVaults()).toEqual([created]);
    expect(() => repository.createVault({ name: "personal" })).toThrowError(
      expect.objectContaining({ code: "INVENTORY_CONFLICT" }),
    );

    const updated = repository.updateVault({ id: created.id, name: "Work" });
    expect(updated).toMatchObject({ id: created.id, name: "Work" });
    expect(updated.createdAt).toBe(created.createdAt);

    repository.deleteVault(created.id);
    expect(repository.listVaults()).toEqual([]);
    expect(() => repository.deleteVault(created.id)).toThrowError(
      expect.objectContaining({ code: "INVENTORY_NOT_FOUND" }),
    );
    repository.close();
  });

  it("round-trips groups, identities, and every extended host field", () => {
    const { repository } = createRepository();
    const vault = repository.createVault({ name: "Infrastructure" });
    const group = repository.createGroup({
      vaultId: vault.id,
      name: "Production",
      color: "coral",
    });
    const identity = repository.createIdentity({
      vaultId: vault.id,
      name: "Deploy key",
      username: "deploy",
      type: "ssh",
      algorithm: "ed25519",
      passphrase: true,
      expires: "2027-01-01",
    });
    const host = repository.createHost({
      vaultId: vault.id,
      groupId: group.id,
      name: "Gateway",
      address: "gateway.secret.internal",
      username: "deploy",
      tags: ["Linux", "Production"],
      notes: "sensitive-note",
      authKind: "privateKey",
      credentialRef: "opaque-credential-reference",
      startupCommands: ["uptime"],
      protocol: "ssh",
      port: 2222,
      baudRate: 115200,
      identity: identity.id,
      jumpHost: "jump-1",
      proxy: "proxy-1",
      env: { TERM: "xterm-256color" },
      startupSnippets: ["snippet-1"],
      status: "online",
      label: "Primary",
      lastConnected: "2026-08-05T03:00:00.000Z",
    });

    expect(repository.listGroups(vault.id)).toEqual([group]);
    expect(repository.listIdentities(vault.id)).toEqual([identity]);
    expect(repository.listHosts(vault.id)).toEqual([host]);

    const updatedIdentity = repository.updateIdentity({
      id: identity.id,
      vaultId: vault.id,
      name: "Updated key",
      username: "admin",
      passphrase: false,
    });
    expect(updatedIdentity).toMatchObject({
      id: identity.id,
      name: "Updated key",
      username: "admin",
      passphrase: false,
    });

    const updatedHost = repository.updateHost({
      ...host,
      name: "Updated gateway",
      address: "updated.secret.internal",
      status: "offline",
    });
    expect(updatedHost).toMatchObject({
      id: host.id,
      name: "Updated gateway",
      address: "updated.secret.internal",
      status: "offline",
    });

    repository.deleteHost(host.id);
    repository.deleteIdentity(identity.id);
    expect(repository.listHosts(vault.id)).toEqual([]);
    expect(repository.listIdentities(vault.id)).toEqual([]);
    repository.close();
  });

  it("stores no sensitive inventory plaintext and cascades vault deletion", () => {
    const { repository, databasePath } = createRepository();
    const vault = repository.createVault({ name: "Secret Vault Name" });
    repository.createGroup({ vaultId: vault.id, name: "Secret Group Name" });
    repository.createIdentity({
      vaultId: vault.id,
      name: "Secret Identity Name",
      username: "secret-user",
    });
    repository.createHost({
      vaultId: vault.id,
      name: "Secret Host Name",
      address: "secret-host.example",
      notes: "secret host notes",
    });

    repository.deleteVault(vault.id);
    expect(repository.listGroups(vault.id)).toEqual([]);
    expect(repository.listIdentities(vault.id)).toEqual([]);
    expect(repository.listHosts(vault.id)).toEqual([]);
    repository.close();

    const bytes = readFileSync(databasePath);
    for (const plaintext of [
      "Secret Vault Name",
      "Secret Group Name",
      "Secret Identity Name",
      "secret-user",
      "Secret Host Name",
      "secret-host.example",
      "secret host notes",
    ]) {
      expect(bytes.includes(Buffer.from(plaintext))).toBe(false);
    }
  });

  it("fails closed when the database is reopened with a different key", () => {
    const created = createRepository();
    created.repository.createVault({ name: "Protected" });
    created.repository.close();

    const wrongKeyRepository = new InventoryRepository(
      openInventoryDatabase(created.databasePath),
      new AesGcmFieldCipher(Buffer.alloc(32, 0x7f)),
    );
    expect(() => wrongKeyRepository.listVaults()).toThrowError(
      expect.objectContaining({ code: "VAULT_DECRYPTION_FAILED" }),
    );
    wrongKeyRepository.close();
  });

  it("keeps a host credential reference after the repository is restarted", () => {
    const created = createRepository();
    const vault = created.repository.createVault({ name: "Restart persistence" });
    const host = created.repository.createHost({
      vaultId: vault.id,
      name: "Persistent host",
      address: "persistent.example.test",
      username: "deploy",
      authKind: "password",
      credentialRef: "opaque-reference-after-restart",
    });
    created.repository.close();

    const reopened = new InventoryRepository(
      openInventoryDatabase(created.databasePath),
      new AesGcmFieldCipher(key),
    );
    expect(reopened.listHosts(vault.id)).toEqual([host]);
    reopened.close();
  });
});

function createRepository(): {
  repository: InventoryRepository;
  databasePath: string;
} {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-repository-"));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, "inventory.sqlite3");
  return {
    repository: new InventoryRepository(
      openInventoryDatabase(databasePath),
      new AesGcmFieldCipher(key),
    ),
    databasePath,
  };
}
