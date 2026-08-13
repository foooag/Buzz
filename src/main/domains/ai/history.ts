import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DomainError } from "../../ipc/domain-error.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { now } from "./types.js";

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

export type SaveAiSession = {
  id?: string;
  title: string;
  providerConfigId: string;
  sshSessionId: string;
  messages: unknown;
};

export type AiSessionSummary = {
  id: string;
  title: string;
  providerConfigId: string;
  sshSessionId: string;
  messageCount: number;
  lastStatus: string | null;
  encryptedBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type AiSessionRecord = AiSessionSummary & { messages: unknown };

type Row = Record<string, unknown>;

export class AiHistoryRepository {
  readonly #database: DatabaseSync;
  readonly #cipher: AesGcmFieldCipher;
  readonly #maxBytes: number;

  constructor(
    database: DatabaseSync,
    cipher: AesGcmFieldCipher,
    maxBytes = DEFAULT_MAX_BYTES,
  ) {
    this.#database = database;
    this.#cipher = cipher;
    this.#maxBytes = maxBytes;
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS ai_sessions (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
          provider_config_id TEXT NOT NULL, ssh_session_id TEXT NOT NULL,
          encrypted_messages BLOB NOT NULL, message_count INTEGER NOT NULL DEFAULT 0,
          last_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_sessions_updated_at ON ai_sessions(updated_at);
      `);
      try {
        database.exec("ALTER TABLE ai_sessions ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0");
      } catch {
        /* column already exists — migration already applied */
      }
      try {
        database.exec("ALTER TABLE ai_sessions ADD COLUMN last_status TEXT");
      } catch {
        /* column already exists — migration already applied */
      }
    } catch {
      throw storageError();
    }
  }

  save(input: SaveAiSession): AiSessionSummary {
    validate(input);
    const id = input.id?.trim() || randomUUID();
    let plaintext: Buffer;
    try {
      plaintext = Buffer.from(JSON.stringify(input.messages));
    } catch {
      throw storageError();
    }
    const messageCount = Array.isArray(input.messages) ? input.messages.length : 0;
    const lastStatus = deriveLastStatus(input.messages);
    const encrypted = this.#cipher.encrypt(context(id), plaintext);
    if (encrypted.byteLength > this.#maxBytes) throw capacityError(
      "This AI session is larger than the history capacity.",
    );
    const timestamp = now();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare(`
        INSERT INTO ai_sessions (id, title, provider_config_id, ssh_session_id,
          encrypted_messages, message_count, last_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title,
          provider_config_id = excluded.provider_config_id,
          ssh_session_id = excluded.ssh_session_id,
          encrypted_messages = excluded.encrypted_messages,
          message_count = excluded.message_count,
          last_status = excluded.last_status,
          updated_at = excluded.updated_at
      `).run(
        id, input.title.trim(), input.providerConfigId, input.sshSessionId,
        encrypted, messageCount, lastStatus, timestamp, timestamp,
      );
      this.#evict(id);
      this.#database.exec("COMMIT");
      return this.#summary(id);
    } catch (error) {
      this.#database.exec("ROLLBACK");
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  list(): AiSessionSummary[] {
    try {
      return this.#database.prepare(`${summarySelect()} ORDER BY updated_at DESC`).all()
        .map((row) => summary(row as Row));
    } catch {
      throw storageError();
    }
  }

  load(id: string): AiSessionRecord {
    try {
      const row = this.#database.prepare(`SELECT id, title, provider_config_id,
        ssh_session_id, length(encrypted_messages) AS encrypted_bytes, created_at,
        updated_at, encrypted_messages FROM ai_sessions WHERE id = ?`
      ).get(id) as Row | undefined;
      if (!row) throw notFound();
      const encrypted = storedBytes(row.encrypted_messages);
      const messages = JSON.parse(this.#cipher.decrypt(context(id), encrypted).toString("utf8"));
      return { ...summary(row), messages };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  delete(id: string): void {
    try {
      if (this.#database.prepare("DELETE FROM ai_sessions WHERE id = ?").run(id).changes === 0) {
        throw notFound();
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  rename(id: string, title: string): AiSessionSummary {
    const trimmed = title.trim();
    if (!trimmed) throw new DomainError("AI_HISTORY_INVALID", "Session title is required.");
    try {
      this.#database.prepare(
        "UPDATE ai_sessions SET title = ?, updated_at = ? WHERE id = ?",
      ).run(trimmed, now(), id);
      return this.#summary(id);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  #summary(id: string): AiSessionSummary {
    const row = this.#database.prepare(`${summarySelect()} WHERE id = ?`).get(id);
    if (!row) throw notFound();
    return summary(row as Row);
  }

  #evict(protectedId: string): void {
    let total = Number(this.#database.prepare(
      "SELECT COALESCE(SUM(length(encrypted_messages)), 0) AS total FROM ai_sessions",
    ).get()?.total ?? 0);
    if (total <= this.#maxBytes) return;
    const target = Math.floor(this.#maxBytes * 0.8);
    const rows = this.#database.prepare(`
      SELECT id, length(encrypted_messages) AS bytes FROM ai_sessions
      WHERE id != ? ORDER BY updated_at ASC
    `).all(protectedId) as Row[];
    for (const row of rows) {
      if (total <= target) break;
      this.#database.prepare("DELETE FROM ai_sessions WHERE id = ?").run(String(row.id));
      total -= Number(row.bytes);
    }
    if (total > this.#maxBytes) throw capacityError(
      "The AI history capacity could not accommodate this session.",
    );
  }
}

function summarySelect(): string {
  return `SELECT id, title, provider_config_id, ssh_session_id,
    length(encrypted_messages) AS encrypted_bytes, message_count, last_status, created_at, updated_at FROM ai_sessions`;
}

function summary(row: Row): AiSessionSummary {
  return {
    id: String(row.id), title: String(row.title),
    providerConfigId: String(row.provider_config_id), sshSessionId: String(row.ssh_session_id),
    messageCount: Number(row.message_count),
    lastStatus: row.last_status ? String(row.last_status) : null,
    encryptedBytes: Number(row.encrypted_bytes),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function context(id: string) {
  return { recordType: "ai_session", recordId: id, vaultId: id, fieldName: "messages" };
}

function validate(input: SaveAiSession): void {
  // Multi-host Agent sessions do not belong to one SSH session. They use an
  // empty sshSessionId so the renderer can distinguish them from terminal AI
  // sessions while still sharing the encrypted history store.
  if (!input.title.trim() || !input.providerConfigId.trim()) {
    throw new DomainError(
      "AI_HISTORY_INVALID",
      "Session title and provider are required.",
    );
  }
}

function storageError(): DomainError {
  return new DomainError(
    "AI_HISTORY_STORAGE_FAILED",
    "The encrypted AI history could not be accessed.",
  );
}

type AgentMessage = {
  role?: string;
  type?: string;
  stopReason?: string;
  content?: unknown;
  toolCallId?: string;
  isError?: boolean;
};

function deriveLastStatus(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const typed = messages as AgentMessage[];
  const lastAssistant = [...typed].reverse().find((m) => m.role === "assistant");
  if (lastAssistant?.stopReason === "aborted") return "aborted";
  const toolResults = typed.filter((m) => m.role === "toolResult");
  const toolCalls = typed.filter(
    (m) => m.role === "assistant" && Array.isArray(m.content) &&
      (m.content as AgentMessage[]).some((c) => c.type === "toolCall"),
  );
  if (toolCalls.length > toolResults.length) return "interrupted";
  if (toolResults.length > 0) {
    const last = toolResults[toolResults.length - 1];
    return last.isError ? "failed" : "done";
  }
  return null;
}

function notFound(): DomainError {
  return new DomainError("AI_HISTORY_NOT_FOUND", "The AI session no longer exists.");
}

function capacityError(message: string): DomainError {
  return new DomainError("AI_HISTORY_CAPACITY_EXCEEDED", message);
}

function storedBytes(value: unknown): Uint8Array {
  if (Buffer.isBuffer(value)) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw storageError();
}
