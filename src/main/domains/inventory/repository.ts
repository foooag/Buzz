import type { DatabaseSync as Database } from "node:sqlite";
import { DomainError } from "../../ipc/domain-error.js";
import { AesGcmFieldCipher, type FieldContext } from "./field-cipher.js";
import {
  createGroup,
  createHost,
  createIdentity,
  createVault,
  type CreateGroup,
  type CreateHost,
  type CreateIdentity,
  type CreateVault,
  type Group,
  type GroupColor,
  type Host,
  type HostAuthKind,
  type HostProtocol,
  type HostStatus,
  type Identity,
  type UpdateHost,
  type UpdateIdentity,
  type UpdateVault,
  type Vault,
} from "./models.js";

type VaultRow = {
  id: string;
  name: Uint8Array;
  createdAt: string;
  updatedAt: string;
};

type GroupRow = {
  id: string;
  vaultId: string;
  parentId: string | null;
  name: Uint8Array;
  color: Uint8Array | null;
  createdAt: string;
  updatedAt: string;
};

type IdentityRow = {
  id: string;
  vaultId: string;
  name: Uint8Array;
  username: Uint8Array;
  type: Uint8Array | null;
  algorithm: Uint8Array | null;
  passphrase: Uint8Array | null;
  expires: Uint8Array | null;
  createdAt: string;
  updatedAt: string;
};

type HostRow = {
  id: string;
  vaultId: string;
  groupId: string | null;
  name: Uint8Array;
  address: Uint8Array;
  username: Uint8Array;
  tags: Uint8Array;
  notes: Uint8Array;
  authKind: Uint8Array | null;
  credentialRef: Uint8Array | null;
  startupCommands: Uint8Array | null;
  protocol: Uint8Array | null;
  port: Uint8Array | null;
  baudRate: Uint8Array | null;
  identity: Uint8Array | null;
  jumpHost: Uint8Array | null;
  proxy: Uint8Array | null;
  env: Uint8Array | null;
  startupSnippets: Uint8Array | null;
  status: Uint8Array | null;
  label: Uint8Array | null;
  lastConnected: Uint8Array | null;
  createdAt: string;
  updatedAt: string;
};

export class InventoryRepository {
  readonly #database: Database;
  readonly #cipher: AesGcmFieldCipher;

  constructor(database: Database, cipher: AesGcmFieldCipher) {
    this.#database = database;
    this.#cipher = cipher;
  }

  close(): void {
    this.#cipher.dispose();
    this.#database.close();
  }

  createVault(input: CreateVault): Vault {
    return this.#storage(() => {
      const vault = createVault(input);
      if (this.listVaults().some((item) => item.name.toLowerCase() === vault.name.toLowerCase())) {
        throw conflict();
      }
      this.#database.prepare(`
        INSERT INTO vaults (id, name, created_at, updated_at, position)
        VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM vaults), 0))
      `).run(
        vault.id,
        this.#encrypt("vault", vault.id, vault.id, "name", vault.name),
        vault.createdAt,
        vault.updatedAt,
      );
      return vault;
    });
  }

  listVaults(): Vault[] {
    return this.#storage(() => {
      const rows = this.#database.prepare(`
        SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
        FROM vaults ORDER BY position, created_at
      `).all() as unknown as VaultRow[];
      return rows.map((row) => ({
        id: row.id,
        name: this.#decrypt("vault", row.id, row.id, "name", row.name),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    });
  }

  updateVault(input: UpdateVault): Vault {
    return this.#storage(() => {
      const existing = this.listVaults().find(({ id }) => id === input.id);
      if (!existing) throw notFound();
      const candidate = createVault({ name: input.name });
      if (this.listVaults().some(
        (item) => item.id !== input.id && item.name.toLowerCase() === candidate.name.toLowerCase(),
      )) throw conflict();
      const updated: Vault = {
        ...candidate,
        id: input.id,
        createdAt: existing.createdAt,
      };
      const result = this.#database.prepare(`
        UPDATE vaults SET name = ?, updated_at = ? WHERE id = ?
      `).run(
        this.#encrypt("vault", updated.id, updated.id, "name", updated.name),
        updated.updatedAt,
        updated.id,
      );
      if (Number(result.changes) === 0) throw notFound();
      return updated;
    });
  }

  deleteVault(id: string): void {
    this.#storage(() => {
      const result = this.#database.prepare("DELETE FROM vaults WHERE id = ?").run(id);
      if (Number(result.changes) === 0) throw notFound();
    });
  }

  createGroup(input: CreateGroup): Group {
    return this.#storage(() => {
      const group = createGroup(input);
      this.#ensureVault(group.vaultId);
      this.#database.prepare(`
        INSERT INTO groups (
          id, vault_id, parent_id, name, color, created_at, updated_at, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT MAX(position) + 1 FROM groups WHERE vault_id = ?), 0)
        )
      `).run(
        group.id,
        group.vaultId,
        group.parentId,
        this.#encrypt("group", group.id, group.vaultId, "name", group.name),
        this.#encryptOptional("group", group.id, group.vaultId, "color", group.color),
        group.createdAt,
        group.updatedAt,
        group.vaultId,
      );
      return group;
    });
  }

  listGroups(vaultId: string): Group[] {
    return this.#storage(() => {
      const rows = this.#database.prepare(`
        SELECT id, vault_id AS vaultId, parent_id AS parentId, name, color,
               created_at AS createdAt, updated_at AS updatedAt
        FROM groups WHERE vault_id = ? ORDER BY position, created_at
      `).all(vaultId) as unknown as GroupRow[];
      return rows.map((row) => {
        const color = this.#decryptOptional(
          "group", row.id, row.vaultId, "color", row.color,
        );
        if (color && !["coral", "teal", "violet", "lime", "fog"].includes(color)) {
          throw decryptionError();
        }
        return {
          id: row.id,
          vaultId: row.vaultId,
          parentId: row.parentId,
          name: this.#decrypt("group", row.id, row.vaultId, "name", row.name),
          ...(color ? { color: color as GroupColor } : {}),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
    });
  }

  createIdentity(input: CreateIdentity): Identity {
    return this.#storage(() => {
      const identity = createIdentity(input);
      this.#ensureVault(identity.vaultId);
      this.#database.prepare(`
        INSERT INTO identities (
          id, vault_id, name, username, type, algorithm, passphrase, expires,
          created_at, updated_at, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT MAX(position) + 1 FROM identities WHERE vault_id = ?), 0)
        )
      `).run(
        identity.id,
        identity.vaultId,
        this.#encrypt("identity", identity.id, identity.vaultId, "name", identity.name),
        this.#encrypt("identity", identity.id, identity.vaultId, "username", identity.username),
        this.#encryptOptional("identity", identity.id, identity.vaultId, "type", identity.type),
        this.#encryptOptional(
          "identity", identity.id, identity.vaultId, "algorithm", identity.algorithm,
        ),
        this.#encryptOptional(
          "identity",
          identity.id,
          identity.vaultId,
          "passphrase",
          identity.passphrase === undefined ? undefined : String(identity.passphrase),
        ),
        this.#encryptOptional(
          "identity", identity.id, identity.vaultId, "expires", identity.expires,
        ),
        identity.createdAt,
        identity.updatedAt,
        identity.vaultId,
      );
      return identity;
    });
  }

  listIdentities(vaultId: string): Identity[] {
    return this.#storage(() => {
      const rows = this.#database.prepare(`
        SELECT id, vault_id AS vaultId, name, username, type, algorithm,
               passphrase, expires, created_at AS createdAt, updated_at AS updatedAt
        FROM identities WHERE vault_id = ? ORDER BY position, created_at
      `).all(vaultId) as unknown as IdentityRow[];
      return rows.map((row) => {
        const passphrase = this.#decryptOptional(
          "identity", row.id, row.vaultId, "passphrase", row.passphrase,
        );
        if (passphrase !== null && passphrase !== "true" && passphrase !== "false") {
          throw decryptionError();
        }
        return {
          id: row.id,
          vaultId: row.vaultId,
          name: this.#decrypt("identity", row.id, row.vaultId, "name", row.name),
          username: this.#decrypt(
            "identity", row.id, row.vaultId, "username", row.username,
          ),
          ...optionalValue("type", this.#decryptOptional(
            "identity", row.id, row.vaultId, "type", row.type,
          )),
          ...optionalValue("algorithm", this.#decryptOptional(
            "identity", row.id, row.vaultId, "algorithm", row.algorithm,
          )),
          ...(passphrase === null ? {} : { passphrase: passphrase === "true" }),
          ...optionalValue("expires", this.#decryptOptional(
            "identity", row.id, row.vaultId, "expires", row.expires,
          )),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
    });
  }

  updateIdentity(input: UpdateIdentity): Identity {
    return this.#storage(() => {
      const existing = this.listIdentities(input.vaultId).find(({ id }) => id === input.id);
      if (!existing) throw notFound();
      const candidate = createIdentity(input);
      const updated: Identity = {
        ...candidate,
        id: input.id,
        createdAt: existing.createdAt,
      };
      const result = this.#database.prepare(`
        UPDATE identities SET name = ?, username = ?, type = ?, algorithm = ?,
          passphrase = ?, expires = ?, updated_at = ?
        WHERE id = ? AND vault_id = ?
      `).run(
        this.#encrypt("identity", updated.id, updated.vaultId, "name", updated.name),
        this.#encrypt(
          "identity", updated.id, updated.vaultId, "username", updated.username,
        ),
        this.#encryptOptional("identity", updated.id, updated.vaultId, "type", updated.type),
        this.#encryptOptional(
          "identity", updated.id, updated.vaultId, "algorithm", updated.algorithm,
        ),
        this.#encryptOptional(
          "identity",
          updated.id,
          updated.vaultId,
          "passphrase",
          updated.passphrase === undefined ? undefined : String(updated.passphrase),
        ),
        this.#encryptOptional(
          "identity", updated.id, updated.vaultId, "expires", updated.expires,
        ),
        updated.updatedAt,
        updated.id,
        updated.vaultId,
      );
      if (Number(result.changes) === 0) throw notFound();
      return updated;
    });
  }

  deleteIdentity(id: string): void {
    this.#storage(() => {
      const result = this.#database.prepare("DELETE FROM identities WHERE id = ?").run(id);
      if (Number(result.changes) === 0) throw notFound();
    });
  }

  createHost(input: CreateHost): Host {
    return this.#storage(() => {
      const host = createHost(input);
      this.#ensureVault(host.vaultId);
      this.#insertHost(host);
      return host;
    });
  }

  listHosts(vaultId: string): Host[] {
    return this.#storage(() => {
      const rows = this.#database.prepare(`
        SELECT id, vault_id AS vaultId, group_id AS groupId, name, address,
          username, tags, notes, auth_kind AS authKind,
          credential_ref AS credentialRef,
          startup_commands AS startupCommands, protocol, port,
          baud_rate AS baudRate, identity, jump_host AS jumpHost, proxy, env,
          startup_snippets AS startupSnippets, status, label,
          last_connected AS lastConnected, created_at AS createdAt,
          updated_at AS updatedAt
        FROM hosts WHERE vault_id = ? ORDER BY position, created_at
      `).all(vaultId) as unknown as HostRow[];
      return rows.map((row) => this.#hostFromRow(row));
    });
  }

  updateHost(input: UpdateHost): Host {
    return this.#storage(() => {
      const existing = this.listHosts(input.vaultId).find(({ id }) => id === input.id);
      if (!existing) throw notFound();
      const candidate = createHost(input);
      const updated: Host = {
        ...candidate,
        id: input.id,
        createdAt: existing.createdAt,
      };
      const values = this.#hostEncryptedValues(updated);
      const result = this.#database.prepare(`
        UPDATE hosts SET group_id = ?, name = ?, address = ?, username = ?, tags = ?,
          notes = ?, auth_kind = ?, credential_ref = ?, startup_commands = ?, protocol = ?, port = ?,
          baud_rate = ?, identity = ?, jump_host = ?, proxy = ?, env = ?,
          startup_snippets = ?, status = ?, label = ?, last_connected = ?, updated_at = ?
        WHERE id = ? AND vault_id = ?
      `).run(
        updated.groupId,
        ...values,
        updated.updatedAt,
        updated.id,
        updated.vaultId,
      );
      if (Number(result.changes) === 0) throw notFound();
      return updated;
    });
  }

  deleteHost(id: string): void {
    this.#storage(() => {
      const result = this.#database.prepare("DELETE FROM hosts WHERE id = ?").run(id);
      if (Number(result.changes) === 0) throw notFound();
    });
  }

  #insertHost(host: Host): void {
    const values = this.#hostEncryptedValues(host);
    this.#database.prepare(`
      INSERT INTO hosts (
        id, vault_id, group_id, name, address, username, tags, notes,
        auth_kind, credential_ref, startup_commands, protocol, port, baud_rate, identity,
        jump_host, proxy, env, startup_snippets, status, label, last_connected,
        created_at, updated_at, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT MAX(position) + 1 FROM hosts WHERE vault_id = ?), 0)
      )
    `).run(
      host.id,
      host.vaultId,
      host.groupId,
      ...values,
      host.createdAt,
      host.updatedAt,
      host.vaultId,
    );
  }

  #hostEncryptedValues(host: Host): Array<Uint8Array | null> {
    return [
      this.#encrypt("host", host.id, host.vaultId, "name", host.name),
      this.#encrypt("host", host.id, host.vaultId, "address", host.address),
      this.#encrypt("host", host.id, host.vaultId, "username", host.username),
      this.#encrypt("host", host.id, host.vaultId, "tags", JSON.stringify(host.tags)),
      this.#encrypt("host", host.id, host.vaultId, "notes", host.notes),
      this.#encryptOptional("host", host.id, host.vaultId, "authKind", host.authKind),
      this.#encryptOptional(
        "host", host.id, host.vaultId, "credentialRef", host.credentialRef,
      ),
      this.#encrypt(
        "host", host.id, host.vaultId, "startupCommands", JSON.stringify(host.startupCommands),
      ),
      this.#encryptOptional("host", host.id, host.vaultId, "protocol", host.protocol),
      this.#encryptOptional(
        "host", host.id, host.vaultId, "port", host.port?.toString(),
      ),
      this.#encryptOptional(
        "host", host.id, host.vaultId, "baudRate", host.baudRate?.toString(),
      ),
      this.#encryptOptional("host", host.id, host.vaultId, "identity", host.identity),
      this.#encryptOptional("host", host.id, host.vaultId, "jumpHost", host.jumpHost),
      this.#encryptOptional("host", host.id, host.vaultId, "proxy", host.proxy),
      this.#encrypt("host", host.id, host.vaultId, "env", JSON.stringify(host.env)),
      this.#encrypt(
        "host", host.id, host.vaultId, "startupSnippets", JSON.stringify(host.startupSnippets),
      ),
      this.#encryptOptional("host", host.id, host.vaultId, "status", host.status),
      this.#encrypt("host", host.id, host.vaultId, "label", host.label),
      this.#encrypt("host", host.id, host.vaultId, "lastConnected", host.lastConnected),
    ];
  }

  #hostFromRow(row: HostRow): Host {
    const authKind = this.#enumOptional(
      row, "authKind", ["password", "privateKey"] as const,
    );
    const protocol = this.#enumOptional(
      row, "protocol", ["ssh", "telnet", "serial"] as const,
    );
    const status = this.#enumOptional(
      row, "status", ["online", "offline", "connecting", "failed"] as const,
    );
    const port = this.#numberOptional(row, "port", 65_535);
    const baudRate = this.#numberOptional(row, "baudRate", 0xffff_ffff);
    return {
      id: row.id,
      vaultId: row.vaultId,
      groupId: row.groupId,
      name: this.#decrypt("host", row.id, row.vaultId, "name", row.name),
      address: this.#decrypt("host", row.id, row.vaultId, "address", row.address),
      username: this.#decrypt("host", row.id, row.vaultId, "username", row.username),
      tags: this.#jsonStringArray(row, "tags", []),
      notes: this.#decrypt("host", row.id, row.vaultId, "notes", row.notes),
      ...(authKind ? { authKind: authKind as HostAuthKind } : {}),
      ...optionalValue("credentialRef", this.#decryptOptional(
        "host", row.id, row.vaultId, "credentialRef", row.credentialRef,
      )),
      startupCommands: this.#jsonStringArray(row, "startupCommands", []),
      ...(protocol ? { protocol: protocol as HostProtocol } : {}),
      ...(port === undefined ? {} : { port }),
      ...(baudRate === undefined ? {} : { baudRate }),
      ...optionalValue("identity", this.#decryptOptional(
        "host", row.id, row.vaultId, "identity", row.identity,
      )),
      ...optionalValue("jumpHost", this.#decryptOptional(
        "host", row.id, row.vaultId, "jumpHost", row.jumpHost,
      )),
      ...optionalValue("proxy", this.#decryptOptional(
        "host", row.id, row.vaultId, "proxy", row.proxy,
      )),
      env: this.#jsonStringRecord(row, "env", {}),
      startupSnippets: this.#jsonStringArray(row, "startupSnippets", []),
      ...(status ? { status: status as HostStatus } : {}),
      label: this.#decryptOptional("host", row.id, row.vaultId, "label", row.label) ?? "",
      lastConnected: this.#decryptOptional(
        "host", row.id, row.vaultId, "lastConnected", row.lastConnected,
      ) ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  #jsonStringArray(
    row: HostRow,
    field: "tags" | "startupCommands" | "startupSnippets",
    fallback: string[],
  ): string[] {
    const value = row[field];
    if (value === null) return fallback;
    try {
      const decoded = JSON.parse(this.#decrypt("host", row.id, row.vaultId, field, value));
      if (!Array.isArray(decoded) || decoded.some((item) => typeof item !== "string")) {
        throw new Error("Invalid list.");
      }
      return decoded;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw decryptionError();
    }
  }

  #jsonStringRecord(
    row: HostRow,
    field: "env",
    fallback: Record<string, string>,
  ): Record<string, string> {
    const value = row[field];
    if (value === null) return fallback;
    try {
      const decoded: unknown = JSON.parse(
        this.#decrypt("host", row.id, row.vaultId, field, value),
      );
      if (
        !decoded ||
        typeof decoded !== "object" ||
        Array.isArray(decoded) ||
        Object.values(decoded).some((item) => typeof item !== "string")
      ) throw new Error("Invalid record.");
      return decoded as Record<string, string>;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw decryptionError();
    }
  }

  #enumOptional<const Values extends readonly string[]>(
    row: HostRow,
    field: "authKind" | "protocol" | "status",
    values: Values,
  ): Values[number] | undefined {
    const value = this.#decryptOptional("host", row.id, row.vaultId, field, row[field]);
    if (value === null) return undefined;
    if (!values.includes(value)) throw decryptionError();
    return value;
  }

  #numberOptional(
    row: HostRow,
    field: "port" | "baudRate",
    maximum: number,
  ): number | undefined {
    const value = this.#decryptOptional("host", row.id, row.vaultId, field, row[field]);
    if (value === null) return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > maximum) throw decryptionError();
    return number;
  }

  #ensureVault(id: string): void {
    const row = this.#database.prepare("SELECT 1 AS found FROM vaults WHERE id = ?").get(id);
    if (!row) throw notFound();
  }

  #encrypt(
    recordType: string,
    recordId: string,
    vaultId: string,
    fieldName: string,
    value: string,
  ): Buffer {
    return this.#cipher.encrypt(
      { recordType, recordId, vaultId, fieldName },
      Buffer.from(value, "utf8"),
    );
  }

  #decrypt(
    recordType: string,
    recordId: string,
    vaultId: string,
    fieldName: string,
    value: Uint8Array,
  ): string {
    try {
      return this.#cipher.decrypt(
        { recordType, recordId, vaultId, fieldName },
        value,
      ).toString("utf8");
    } catch {
      throw decryptionError();
    }
  }

  #encryptOptional(
    recordType: string,
    recordId: string,
    vaultId: string,
    fieldName: string,
    value: string | undefined,
  ): Buffer | null {
    return value === undefined
      ? null
      : this.#encrypt(recordType, recordId, vaultId, fieldName, value);
  }

  #decryptOptional(
    recordType: string,
    recordId: string,
    vaultId: string,
    fieldName: string,
    value: Uint8Array | null,
  ): string | null {
    return value === null
      ? null
      : this.#decrypt(recordType, recordId, vaultId, fieldName, value);
  }

  #storage<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }
}

function optionalValue<Key extends string>(
  key: Key,
  value: string | null,
): Partial<Record<Key, string>> {
  return value === null ? {} : { [key]: value } as Record<Key, string>;
}

function notFound(): DomainError {
  return new DomainError(
    "INVENTORY_NOT_FOUND",
    "The inventory resource no longer exists.",
  );
}

function conflict(): DomainError {
  return new DomainError(
    "INVENTORY_CONFLICT",
    "An inventory resource with this name already exists.",
  );
}

function storageError(): DomainError {
  return new DomainError(
    "INVENTORY_STORAGE_FAILED",
    "The local inventory could not be saved.",
  );
}

function decryptionError(): DomainError {
  return new DomainError(
    "VAULT_DECRYPTION_FAILED",
    "The encrypted inventory could not be unlocked.",
  );
}
