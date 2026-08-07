import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { DomainError } from "../../ipc/domain-error.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import {
  now,
  UNTESTED_CAPABILITIES,
  type AiProviderConfig,
  type CreateAiProviderConfig,
  type ProviderTestResult,
  type ResolvedAiProviderConfig,
  type UpdateAiProviderConfig,
} from "./types.js";
import {
  credentialHint,
  normalizeCreate,
  normalizeUpdate,
  requiresCredential,
} from "./validation.js";
import { openAiDatabase } from "./database.js";

type StoredRow = Record<string, unknown>;
export const AI_SCHEMA_VERSION = 1;

export class AiConfigRepository {
  readonly #database: DatabaseSync;
  readonly #cipher: AesGcmFieldCipher;

  constructor(database: DatabaseSync, cipher: AesGcmFieldCipher) {
    this.#database = database;
    this.#cipher = cipher;
    migrate(database);
  }

  static open(filePath: string, cipher: AesGcmFieldCipher): AiConfigRepository {
    mkdirSync(path.dirname(filePath), { recursive: true });
    return new AiConfigRepository(openAiDatabase(filePath), cipher);
  }

  create(input: CreateAiProviderConfig): AiProviderConfig {
    const normalized = normalizeCreate(input);
    const id = randomUUID();
    const timestamp = now();
    const apiKey = normalized.apiKey ?? "";
    const encrypted = this.#cipher.encrypt(fieldContext(id), Buffer.from(apiKey));
    return this.#transaction(() => {
      if (input.isDefault) this.#database.exec("UPDATE ai_provider_configs SET is_default = 0");
      this.#database.prepare(`
        INSERT INTO ai_provider_configs (
          id, provider_kind, name, endpoint, model, api_key, credential_hint,
          is_default, connection_status, capability_streaming,
          capability_tool_calling, capability_structured_output,
          capability_reasoning, context_window_tokens, max_output_tokens,
          price_input_per_million, price_output_per_million,
          price_cache_read_per_million, price_cache_write_per_million,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'untested', 'untested', 'untested',
          'untested', 'untested', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.providerKind, normalized.name, normalized.baseUrl, normalized.modelId,
        encrypted, apiKey ? credentialHint(apiKey) : null, input.isDefault ? 1 : 0,
        input.contextWindowTokens ?? null, input.maxOutputTokens ?? null,
        input.pricing?.inputPerMillion ?? null, input.pricing?.outputPerMillion ?? null,
        input.pricing?.cacheReadPerMillion ?? null,
        input.pricing?.cacheWritePerMillion ?? null, timestamp, timestamp,
      );
      return this.getResolved(id).public;
    });
  }

  list(): AiProviderConfig[] {
    try {
      return this.#database.prepare(`${selectColumns()} ORDER BY created_at`).all()
        .map((row) => this.#resolve(row as StoredRow).public);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  getResolved(id: string): ResolvedAiProviderConfig {
    try {
      const row = this.#database.prepare(`${selectColumns()} WHERE id = ?`).get(id);
      if (!row) throw notFound();
      return this.#resolve(row as StoredRow);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }

  update(input: UpdateAiProviderConfig): AiProviderConfig {
    const normalized = normalizeUpdate(input);
    return this.#transaction(() => {
      const existing = this.#database.prepare(`
        SELECT provider_kind, endpoint, model, credential_hint, api_key
        FROM ai_provider_configs WHERE id = ?
      `).get(input.id) as StoredRow | undefined;
      if (!existing) throw notFound();
      if (input.isDefault) this.#database.exec("UPDATE ai_provider_configs SET is_default = 0");

      const submitted = input.apiKey?.trim() || undefined;
      const switchingToKeyless = !requiresCredential(input.providerKind) &&
        existing.provider_kind !== "ollama";
      const replacement = requiresCredential(input.providerKind)
        ? submitted
        : switchingToKeyless || submitted !== undefined ? "" : undefined;
      if (requiresCredential(input.providerKind) && replacement === undefined) {
        const current = this.#decrypt(input.id, existing.api_key);
        if (!current) throw new DomainError(
          "AI_CONFIG_VALIDATION_FAILED",
          "API key is required for this provider.",
        );
      }
      const criticalChanged = existing.provider_kind !== input.providerKind ||
        existing.endpoint !== normalized.baseUrl || existing.model !== normalized.modelId ||
        replacement !== undefined;
      const hint: string | null = requiresCredential(input.providerKind)
        ? submitted
          ? credentialHint(submitted)
          : typeof existing.credential_hint === "string" ? existing.credential_hint : null
        : null;
      const encrypted: Uint8Array = replacement === undefined
        ? storedBytes(existing.api_key)
        : this.#cipher.encrypt(fieldContext(input.id), Buffer.from(replacement));
      const timestamp = now();
      const changed = this.#database.prepare(`
        UPDATE ai_provider_configs SET
          provider_kind = ?, name = ?, endpoint = ?, model = ?, api_key = ?,
          credential_hint = ?, is_default = ?,
          connection_status = CASE WHEN ? THEN 'untested' ELSE connection_status END,
          latency_ms = CASE WHEN ? THEN NULL ELSE latency_ms END,
          tested_at = CASE WHEN ? THEN NULL ELSE tested_at END,
          test_error = CASE WHEN ? THEN NULL ELSE test_error END,
          capability_streaming = CASE WHEN ? THEN 'untested' ELSE capability_streaming END,
          capability_tool_calling = CASE WHEN ? THEN 'untested' ELSE capability_tool_calling END,
          capability_structured_output = CASE WHEN ? THEN 'untested' ELSE capability_structured_output END,
          capability_reasoning = CASE WHEN ? THEN 'untested' ELSE capability_reasoning END,
          context_window_tokens = ?, max_output_tokens = ?,
          price_input_per_million = ?, price_output_per_million = ?,
          price_cache_read_per_million = ?, price_cache_write_per_million = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.providerKind, normalized.name, normalized.baseUrl, normalized.modelId, encrypted,
        hint ?? null, input.isDefault ? 1 : 0,
        ...Array(8).fill(criticalChanged ? 1 : 0),
        input.contextWindowTokens ?? null, input.maxOutputTokens ?? null,
        input.pricing?.inputPerMillion ?? null, input.pricing?.outputPerMillion ?? null,
        input.pricing?.cacheReadPerMillion ?? null,
        input.pricing?.cacheWritePerMillion ?? null, timestamp, input.id,
      );
      if (changed.changes === 0) throw notFound();
      return this.getResolved(input.id).public;
    });
  }

  setTesting(id: string): void {
    const result = this.#database.prepare(`
      UPDATE ai_provider_configs SET connection_status = 'testing', test_error = NULL,
      updated_at = ? WHERE id = ?
    `).run(now(), id);
    if (result.changes === 0) throw notFound();
  }

  saveTestResult(id: string, result: ProviderTestResult): AiProviderConfig {
    const changed = this.#database.prepare(`
      UPDATE ai_provider_configs SET connection_status = ?, latency_ms = ?, tested_at = ?,
        test_error = ?, capability_streaming = ?, capability_tool_calling = ?,
        capability_structured_output = ?, capability_reasoning = ?, updated_at = ?
      WHERE id = ?
    `).run(
      result.status, result.latencyMs ?? null, result.testedAt, result.error ?? null,
      result.capabilities.streaming, result.capabilities.toolCalling,
      result.capabilities.structuredOutput, result.capabilities.reasoning, now(), id,
    );
    if (changed.changes === 0) throw notFound();
    return this.getResolved(id).public;
  }

  delete(id: string): void {
    if (this.#database.prepare("DELETE FROM ai_provider_configs WHERE id = ?").run(id).changes === 0) {
      throw notFound();
    }
  }

  close(): void {
    this.#database.close();
  }

  #resolve(row: StoredRow): ResolvedAiProviderConfig {
    const apiKey = this.#decrypt(String(row.id), row.api_key);
    const configured = apiKey.length > 0;
    const prices = [
      row.price_input_per_million,
      row.price_output_per_million,
      row.price_cache_read_per_million,
      row.price_cache_write_per_million,
    ];
    const pricing = prices.every((value) => typeof value === "number") ? {
      inputPerMillion: prices[0] as number,
      outputPerMillion: prices[1] as number,
      cacheReadPerMillion: prices[2] as number,
      cacheWritePerMillion: prices[3] as number,
    } : undefined;
    return {
      apiKey: configured ? apiKey : undefined,
      public: {
        id: String(row.id),
        providerKind: row.provider_kind as AiProviderConfig["providerKind"],
        name: String(row.name),
        baseUrl: String(row.endpoint),
        modelId: String(row.model),
        credentialConfigured: configured,
        ...(configured ? { credentialHint: String(row.credential_hint || credentialHint(apiKey)) } : {}),
        isDefault: Number(row.is_default) !== 0,
        connectionStatus: row.connection_status as AiProviderConfig["connectionStatus"],
        ...(typeof row.latency_ms === "number" ? { latencyMs: row.latency_ms } : {}),
        ...(typeof row.tested_at === "string" ? { testedAt: row.tested_at } : {}),
        ...(typeof row.test_error === "string" ? { testError: row.test_error } : {}),
        capabilities: {
          streaming: row.capability_streaming as AiProviderConfig["capabilities"]["streaming"],
          toolCalling: row.capability_tool_calling as AiProviderConfig["capabilities"]["toolCalling"],
          structuredOutput: row.capability_structured_output as AiProviderConfig["capabilities"]["structuredOutput"],
          reasoning: row.capability_reasoning as AiProviderConfig["capabilities"]["reasoning"],
        },
        ...(typeof row.context_window_tokens === "number"
          ? { contextWindowTokens: row.context_window_tokens } : {}),
        ...(typeof row.max_output_tokens === "number"
          ? { maxOutputTokens: row.max_output_tokens } : {}),
        ...(pricing ? { pricing } : {}),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      },
    };
  }

  #decrypt(id: string, value: unknown): string {
    return this.#cipher.decrypt(fieldContext(id), storedBytes(value)).toString("utf8");
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      if (error instanceof DomainError) throw error;
      throw storageError();
    }
  }
}

function migrate(database: DatabaseSync): void {
  try {
    const version = Number(database.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    if (version > AI_SCHEMA_VERSION) throw new DomainError(
      "AI_CONFIG_MIGRATION_FAILED",
      "The AI configuration database could not be upgraded.",
    );
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS ai_provider_configs (
        id TEXT PRIMARY KEY NOT NULL, provider_kind TEXT NOT NULL, name TEXT NOT NULL,
        endpoint TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', api_key BLOB NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    const existing = new Set(
      (database.prepare("PRAGMA table_info(ai_provider_configs)").all() as StoredRow[])
        .map((row) => String(row.name)),
    );
    const columns: Record<string, string> = {
      credential_hint: "TEXT", connection_status: "TEXT NOT NULL DEFAULT 'untested'",
      latency_ms: "INTEGER", tested_at: "TEXT", test_error: "TEXT",
      capability_streaming: "TEXT NOT NULL DEFAULT 'untested'",
      capability_tool_calling: "TEXT NOT NULL DEFAULT 'untested'",
      capability_structured_output: "TEXT NOT NULL DEFAULT 'untested'",
      capability_reasoning: "TEXT NOT NULL DEFAULT 'untested'",
      context_window_tokens: "INTEGER", max_output_tokens: "INTEGER",
      price_input_per_million: "REAL", price_output_per_million: "REAL",
      price_cache_read_per_million: "REAL", price_cache_write_per_million: "REAL",
    };
    for (const [name, definition] of Object.entries(columns)) {
      if (!existing.has(name)) database.exec(
        `ALTER TABLE ai_provider_configs ADD COLUMN ${name} ${definition}`,
      );
    }
    database.exec(`
      UPDATE ai_provider_configs SET endpoint = CASE provider_kind
        WHEN 'anthropic' THEN 'https://api.anthropic.com'
        WHEN 'openai' THEN 'https://api.openai.com/v1'
        WHEN 'ollama' THEN 'http://127.0.0.1:11434/v1'
      ELSE endpoint END WHERE endpoint = '';
      PRAGMA user_version = ${AI_SCHEMA_VERSION};
    `);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      "AI_CONFIG_MIGRATION_FAILED",
      "The AI configuration database could not be upgraded.",
    );
  }
}

function selectColumns(): string {
  return `SELECT id, provider_kind, name, endpoint, model, credential_hint, is_default,
    connection_status, latency_ms, tested_at, test_error, capability_streaming,
    capability_tool_calling, capability_structured_output, capability_reasoning,
    context_window_tokens, max_output_tokens, price_input_per_million,
    price_output_per_million, price_cache_read_per_million, price_cache_write_per_million,
    created_at, updated_at, api_key FROM ai_provider_configs`;
}

function fieldContext(id: string) {
  return { recordType: "ai_provider_config", recordId: id, vaultId: id, fieldName: "api_key" };
}

function storedBytes(value: unknown): Uint8Array {
  if (Buffer.isBuffer(value)) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw storageError();
}

function storageError(): DomainError {
  return new DomainError("AI_CONFIG_STORAGE_FAILED", "The AI configuration could not be saved.");
}

function notFound(): DomainError {
  return new DomainError("AI_CONFIG_NOT_FOUND", "The AI configuration no longer exists.");
}
