import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { DomainError } from "../../ipc/domain-error.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const SCHEMA_VERSION = 2;

export type ForwardKind = "local" | "remote" | "dynamic";

export type PortForwardRuleRecord = {
  id: string;
  hostId: string;
  kind: ForwardKind;
  bindHost: string;
  bindPort: number;
  targetHost: string | null;
  targetPort: number | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ForwardingRepository {
  readonly #database: Database;

  static open(databasePath: string): ForwardingRepository {
    try {
      mkdirSync(path.dirname(databasePath), { recursive: true });
      const database = new DatabaseSync(databasePath);
      try {
        migrate(database);
        return new ForwardingRepository(database);
      } catch (error) {
        database.close();
        throw error;
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  constructor(database: Database) {
    this.#database = database;
  }

  close(): void {
    this.#database.close();
  }

  create(rule: PortForwardRuleRecord): void {
    this.#storage(() => {
      validateRule(rule);
      this.#database.prepare(`
        INSERT INTO port_forward_rules (
          id, host_id, kind, bind_host, bind_port, target_host, target_port,
          label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rule.id,
        rule.hostId,
        rule.kind,
        rule.bindHost,
        rule.bindPort,
        rule.targetHost,
        rule.targetPort,
        rule.label,
        rule.createdAt,
        rule.updatedAt,
      );
    });
  }

  createRule(
    rule: PortForwardRuleRecord,
    now = new Date().toISOString(),
  ): PortForwardRuleRecord {
    const created = {
      ...rule,
      id: rule.id.trim() || randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.create(created);
    return created;
  }

  listForHost(hostId: string): PortForwardRuleRecord[] {
    return this.#storage(() => this.#database.prepare(`
      SELECT id, host_id AS hostId, kind, bind_host AS bindHost,
        bind_port AS bindPort, target_host AS targetHost,
        target_port AS targetPort, label, created_at AS createdAt,
        updated_at AS updatedAt
      FROM port_forward_rules WHERE host_id = ? ORDER BY created_at
    `).all(hostId) as unknown as PortForwardRuleRecord[]);
  }

  update(rule: PortForwardRuleRecord): void {
    this.#storage(() => {
      validateRule(rule);
      const result = this.#database.prepare(`
        UPDATE port_forward_rules SET kind = ?, bind_host = ?, bind_port = ?,
          target_host = ?, target_port = ?, label = ?, updated_at = ?
        WHERE id = ?
      `).run(
        rule.kind,
        rule.bindHost,
        rule.bindPort,
        rule.targetHost,
        rule.targetPort,
        rule.label,
        rule.updatedAt,
        rule.id,
      );
      if (Number(result.changes) === 0) throw notFound();
    });
  }

  updateRule(
    rule: PortForwardRuleRecord,
    now = new Date().toISOString(),
  ): PortForwardRuleRecord {
    const updated = { ...rule, updatedAt: now };
    this.update(updated);
    return updated;
  }

  delete(id: string): void {
    this.#storage(() => {
      const result = this.#database.prepare(
        "DELETE FROM port_forward_rules WHERE id = ?",
      ).run(id);
      if (Number(result.changes) === 0) throw notFound();
    });
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

function migrate(database: Database): void {
  const version = (database.prepare("PRAGMA user_version").get() as {
    user_version: number;
  }).user_version;
  if (version > SCHEMA_VERSION) throw migrationError();
  try {
    database.exec("BEGIN IMMEDIATE");
    if (version < 1) {
      database.exec(`
        CREATE TABLE port_forward_rules (
          id TEXT PRIMARY KEY NOT NULL,
          host_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          bind_host TEXT NOT NULL,
          bind_port INTEGER NOT NULL,
          target_host TEXT,
          target_port INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_port_forward_rules_host ON port_forward_rules(host_id);
      `);
    }
    if (version < 2) {
      database.exec("ALTER TABLE port_forward_rules ADD COLUMN label TEXT;");
    }
    database.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    database.exec("COMMIT");
  } catch {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the sanitized migration error.
    }
    throw migrationError();
  }
}

function validateRule(rule: PortForwardRuleRecord): void {
  if (
    !rule.id.trim() ||
    !rule.hostId.trim() ||
    !["local", "remote", "dynamic"].includes(rule.kind) ||
    !rule.bindHost.trim() ||
    !validPort(rule.bindPort) ||
    !rule.createdAt ||
    !rule.updatedAt
  ) throw validationError();
  if (
    rule.kind !== "dynamic" &&
    (!rule.targetHost?.trim() || !validPort(rule.targetPort))
  ) throw validationError();
  if (rule.kind === "dynamic" && rule.targetPort !== null && !validPort(rule.targetPort)) {
    throw validationError();
  }
}

function validPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

function validationError(): DomainError {
  return new DomainError(
    "PORT_FORWARD_INVALID_RULE",
    "The port forwarding rule is invalid.",
  );
}

function migrationError(): DomainError {
  return new DomainError(
    "FORWARDING_MIGRATION_FAILED",
    "The port forwarding database could not be upgraded.",
  );
}

function storageError(): DomainError {
  return new DomainError(
    "FORWARDING_STORAGE_FAILED",
    "The port forwarding store could not be read or written.",
  );
}

function notFound(): DomainError {
  return new DomainError(
    "PORT_FORWARD_NOT_FOUND",
    "The port forwarding rule was not found.",
  );
}
