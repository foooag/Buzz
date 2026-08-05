import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  INVENTORY_SCHEMA_VERSION,
  migrateInventoryDatabase,
  openInventoryDatabase,
} from "../../../../electron/domains/inventory/database";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron inventory database migrations", () => {
  it("creates the complete schema expected by the existing encrypted repository", () => {
    const directory = createTemporaryDirectory();
    const database = openInventoryDatabase(path.join(directory, "inventory.sqlite3"));

    expect(userVersion(database)).toBe(INVENTORY_SCHEMA_VERSION);
    expect(tableNames(database)).toEqual([
      "groups",
      "hosts",
      "identities",
      "known_hosts",
      "vaults",
    ]);
    expect(columnNames(database, "hosts")).toEqual(expect.arrayContaining([
      "auth_kind",
      "credential_ref",
      "startup_commands",
      "protocol",
      "port",
      "baud_rate",
      "identity",
      "jump_host",
      "proxy",
      "env",
      "startup_snippets",
      "status",
      "label",
      "last_connected",
    ]));
    expect(columnNames(database, "identities")).toEqual(expect.arrayContaining([
      "type",
      "algorithm",
      "passphrase",
      "expires",
    ]));
    database.close();
  });

  it("enables foreign keys and preserves cascade deletion behavior", () => {
    const directory = createTemporaryDirectory();
    const database = openInventoryDatabase(path.join(directory, "inventory.sqlite3"));
    database.prepare(
      "INSERT INTO vaults (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run("vault-1", Buffer.from("encrypted"), "now", "now");
    database.prepare(
      "INSERT INTO groups (id, vault_id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("group-1", "vault-1", null, Buffer.from("encrypted"), "now", "now");

    database.prepare("DELETE FROM vaults WHERE id = ?").run("vault-1");

    expect(database.prepare("SELECT COUNT(*) AS count FROM groups").get())
      .toEqual({ count: 0 });
    database.close();
  });

  it("refuses databases created by a newer application version", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`PRAGMA user_version = ${INVENTORY_SCHEMA_VERSION + 1}`);

    expect(() => migrateInventoryDatabase(database)).toThrowError(
      expect.objectContaining({ code: "INVENTORY_MIGRATION_FAILED" }),
    );
    database.close();
  });

  it("upgrades version 5 hosts with durable credential references", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE hosts (id TEXT PRIMARY KEY NOT NULL);
      PRAGMA user_version = 5;
    `);

    migrateInventoryDatabase(database);

    expect(userVersion(database)).toBe(INVENTORY_SCHEMA_VERSION);
    expect(columnNames(database, "hosts")).toContain("credential_ref");
    database.close();
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-inventory-"));
  temporaryDirectories.push(directory);
  return directory;
}

function userVersion(database: Database): number {
  return (database.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
}

function tableNames(database: Database): string[] {
  return (database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all() as Array<{ name: string }>).map(({ name }) => name);
}

function columnNames(database: Database, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map(({ name }) => name);
}
