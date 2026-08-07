import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { DomainError } from "../../ipc/domain-error.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export const INVENTORY_SCHEMA_VERSION = 6;

export function openInventoryDatabase(databasePath: string): Database {
  try {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new DatabaseSync(databasePath);
    try {
      migrateInventoryDatabase(database);
      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw storageError();
  }
}

export function migrateInventoryDatabase(database: Database): void {
  const version = readUserVersion(database);
  if (version > INVENTORY_SCHEMA_VERSION) throw migrationError();

  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("BEGIN IMMEDIATE");

    if (version === 0) {
      database.exec(`
        CREATE TABLE vaults (
          id TEXT PRIMARY KEY NOT NULL,
          name BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE groups (
          id TEXT PRIMARY KEY NOT NULL,
          vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
          parent_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
          name BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE hosts (
          id TEXT PRIMARY KEY NOT NULL,
          vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
          group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
          name BLOB NOT NULL,
          address BLOB NOT NULL,
          username BLOB NOT NULL,
          tags BLOB NOT NULL,
          notes BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE identities (
          id TEXT PRIMARY KEY NOT NULL,
          vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
          name BLOB NOT NULL,
          username BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0
        );
      `);
    }

    if (version < 2) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS known_hosts (
          hostname TEXT NOT NULL,
          port INTEGER NOT NULL,
          algorithm TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          public_key BLOB NOT NULL,
          first_confirmed_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (hostname, port)
        );
      `);
    }

    if (version < 3) {
      database.exec(`
        ALTER TABLE identities ADD COLUMN type BLOB;
        ALTER TABLE identities ADD COLUMN algorithm BLOB;
        ALTER TABLE identities ADD COLUMN passphrase BLOB;
        ALTER TABLE identities ADD COLUMN expires BLOB;
      `);
    }

    if (version < 4) {
      database.exec(`
        ALTER TABLE hosts ADD COLUMN auth_kind BLOB;
        ALTER TABLE hosts ADD COLUMN startup_commands BLOB;
      `);
    }

    if (version < 5) {
      database.exec(`
        ALTER TABLE groups ADD COLUMN color BLOB;
        ALTER TABLE hosts ADD COLUMN protocol BLOB;
        ALTER TABLE hosts ADD COLUMN port BLOB;
        ALTER TABLE hosts ADD COLUMN baud_rate BLOB;
        ALTER TABLE hosts ADD COLUMN identity BLOB;
        ALTER TABLE hosts ADD COLUMN jump_host BLOB;
        ALTER TABLE hosts ADD COLUMN proxy BLOB;
        ALTER TABLE hosts ADD COLUMN env BLOB;
        ALTER TABLE hosts ADD COLUMN startup_snippets BLOB;
        ALTER TABLE hosts ADD COLUMN status BLOB;
        ALTER TABLE hosts ADD COLUMN label BLOB;
        ALTER TABLE hosts ADD COLUMN last_connected BLOB;
      `);
    }

    if (version < 6) {
      database.exec("ALTER TABLE hosts ADD COLUMN credential_ref BLOB;");
    }

    database.exec(`PRAGMA user_version = ${INVENTORY_SCHEMA_VERSION}`);
    database.exec("COMMIT");
  } catch {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The transaction may not have started; preserve the sanitized error below.
    }
    throw migrationError();
  }
}

function readUserVersion(database: Database): number {
  try {
    const row = database.prepare("PRAGMA user_version").get() as
      | { user_version?: unknown }
      | undefined;
    if (typeof row?.user_version !== "number") throw new Error("Invalid schema version.");
    return row.user_version;
  } catch {
    throw migrationError();
  }
}

function storageError(): DomainError {
  return new DomainError(
    "INVENTORY_STORAGE_FAILED",
    "The local inventory could not be accessed.",
  );
}

function migrationError(): DomainError {
  return new DomainError(
    "INVENTORY_MIGRATION_FAILED",
    "The local inventory database could not be upgraded.",
  );
}
