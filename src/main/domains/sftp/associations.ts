import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";
import { DomainError } from "../../ipc/domain-error.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type SftpAssociation = {
  extension: string;
  appPath: string;
  appName: string;
  updatedAt: string;
};

export class SftpAssociations {
  readonly #database: Database;

  static open(databasePath: string): SftpAssociations {
    try {
      mkdirSync(path.dirname(databasePath), { recursive: true });
      const database = new DatabaseSync(databasePath);
      database.exec(`
        CREATE TABLE IF NOT EXISTS sftp_file_associations (
          extension TEXT PRIMARY KEY,
          app_path TEXT NOT NULL,
          app_name TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      return new SftpAssociations(database);
    } catch {
      throw new DomainError(
        "SFTP_LOCAL_FS_DENIED",
        "The associations database could not be opened.",
      );
    }
  }

  constructor(database: Database) {
    this.#database = database;
  }

  close(): void {
    this.#database.close();
  }

  list(): SftpAssociation[] {
    return this.#read(() => this.#database.prepare(`
      SELECT extension, app_path AS appPath, app_name AS appName,
        updated_at AS updatedAt
      FROM sftp_file_associations ORDER BY extension
    `).all() as unknown as SftpAssociation[]);
  }

  get(extension: string): SftpAssociation | null {
    return this.#read(() => (
      this.#database.prepare(`
        SELECT extension, app_path AS appPath, app_name AS appName,
          updated_at AS updatedAt
        FROM sftp_file_associations WHERE extension = ?
      `).get(extension) as SftpAssociation | undefined
    ) ?? null);
  }

  set(
    extension: string,
    appPath: string,
    appName: string,
    updatedAt = new Date().toISOString(),
  ): SftpAssociation {
    const association = { extension, appPath, appName, updatedAt };
    if (!extension.trim() || !appPath.trim() || !appName.trim()) throw writeError();
    try {
      this.#database.prepare(`
        INSERT INTO sftp_file_associations (
          extension, app_path, app_name, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(extension) DO UPDATE SET
          app_path = excluded.app_path,
          app_name = excluded.app_name,
          updated_at = excluded.updated_at
      `).run(extension, appPath, appName, updatedAt);
      return association;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw writeError();
    }
  }

  delete(extension: string): void {
    try {
      this.#database.prepare(
        "DELETE FROM sftp_file_associations WHERE extension = ?",
      ).run(extension);
    } catch {
      throw new DomainError(
        "SFTP_LOCAL_FS_DENIED",
        "The association could not be deleted.",
      );
    }
  }

  #read<T>(operation: () => T): T {
    try {
      return operation();
    } catch {
      throw new DomainError(
        "SFTP_LOCAL_FS_DENIED",
        "Associations could not be read.",
      );
    }
  }
}

function writeError(): DomainError {
  return new DomainError(
    "SFTP_LOCAL_FS_DENIED",
    "The association could not be saved.",
  );
}
