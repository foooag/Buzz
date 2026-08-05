import { createHash } from "node:crypto";
import type { DatabaseSync as Database } from "node:sqlite";
import { DomainError } from "../../ipc/domain-error.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";

export type KnownHostRecord = {
  hostname: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  firstConfirmedAt: string;
  updatedAt: string;
};

export type HostKeyStatus =
  | { type: "trusted" }
  | { type: "unknown"; algorithm: string; fingerprint: string }
  | { type: "changed"; expected: string; presented: string };

type StoredHostKey = { fingerprint: string; publicKey: Uint8Array };

export class KnownHostsRepository {
  readonly #database: Database;
  readonly #cipher: AesGcmFieldCipher;

  constructor(database: Database, cipher: AesGcmFieldCipher) {
    this.#database = database;
    this.#cipher = cipher;
  }

  check(hostname: string, port: number, publicKey: Buffer): HostKeyStatus {
    return this.#storage(() => {
      const host = normalizeHost(hostname);
      const key = inspectPublicKey(publicKey);
      const row = this.#database.prepare(`
        SELECT fingerprint, public_key AS publicKey
        FROM known_hosts WHERE hostname = ? AND port = ?
      `).get(host, port) as StoredHostKey | undefined;
      if (!row) {
        return { type: "unknown", algorithm: key.algorithm, fingerprint: key.fingerprint };
      }
      const decrypted = this.#cipher.decrypt(context(host, port), row.publicKey);
      try {
        if (decrypted.equals(key.encoded)) return { type: "trusted" };
        return {
          type: "changed",
          expected: row.fingerprint,
          presented: key.fingerprint,
        };
      } finally {
        decrypted.fill(0);
      }
    });
  }

  trust(hostname: string, port: number, publicKey: Buffer): void {
    this.#storage(() => {
      const host = normalizeHost(hostname);
      const key = inspectPublicKey(publicKey);
      const encrypted = this.#cipher.encrypt(context(host, port), key.encoded);
      const timestamp = new Date().toISOString();
      this.#database.prepare(`
        INSERT INTO known_hosts (
          hostname, port, algorithm, fingerprint, public_key,
          first_confirmed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hostname, port) DO UPDATE SET
          algorithm = excluded.algorithm,
          fingerprint = excluded.fingerprint,
          public_key = excluded.public_key,
          updated_at = excluded.updated_at
      `).run(
        host,
        port,
        key.algorithm,
        key.fingerprint,
        encrypted,
        timestamp,
        timestamp,
      );
    });
  }

  remove(hostname: string, port: number): void {
    this.#storage(() => {
      this.#database.prepare(
        "DELETE FROM known_hosts WHERE hostname = ? AND port = ?",
      ).run(normalizeHost(hostname), port);
    });
  }

  list(): KnownHostRecord[] {
    return this.#storage(() => this.#database.prepare(`
      SELECT hostname, port, algorithm, fingerprint,
        first_confirmed_at AS firstConfirmedAt, updated_at AS updatedAt
      FROM known_hosts ORDER BY hostname, port
    `).all() as unknown as KnownHostRecord[]);
  }

  close(): void {
    this.#cipher.dispose();
    this.#database.close();
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

export function inspectPublicKey(publicKey: Buffer): {
  algorithm: string;
  fingerprint: string;
  encoded: Buffer;
} {
  if (publicKey.byteLength < 5) throw storageError();
  const algorithmLength = publicKey.readUInt32BE(0);
  if (algorithmLength === 0 || algorithmLength + 4 > publicKey.byteLength) {
    throw storageError();
  }
  const algorithmBytes = publicKey.subarray(4, 4 + algorithmLength);
  const algorithm = algorithmBytes.toString("ascii");
  if (!/^[a-zA-Z0-9@._+-]+$/.test(algorithm)) throw storageError();
  const digest = createHash("sha256").update(publicKey).digest("base64").replace(/=+$/, "");
  return {
    algorithm,
    fingerprint: `SHA256:${digest}`,
    encoded: Buffer.from(`${algorithm} ${publicKey.toString("base64")}`, "utf8"),
  };
}

function normalizeHost(hostname: string): string {
  const host = hostname.trim().replace(/\.+$/, "").toLowerCase();
  if (!host) throw storageError();
  return host;
}

function context(hostname: string, port: number) {
  return {
    recordType: "knownHost",
    recordId: `${hostname}:${port}`,
    vaultId: "known-hosts",
    fieldName: "publicKey",
  };
}

function storageError(): DomainError {
  return new DomainError(
    "INVENTORY_STORAGE_FAILED",
    "The trusted host record could not be saved.",
  );
}
