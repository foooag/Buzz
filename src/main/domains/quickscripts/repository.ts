import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { normalizeForMatch } from "./extractor.js";
import type { QuickScript, QuickScriptMode, QuickScriptPatch, QuickScriptStatus } from "../../../shared/ipc/quickscripts/types.js";

export type GeneratedScript = {
  title: string;
  script: string;
  description: string | null;
  riskHint: string | null;
  confidence: number;
  /** Source-session stats; filled by the generation service, default 0. */
  sourceUsageCount?: number;
  sourceSuccessCount?: number;
};

const MAX_POOL = 8;

type Row = {
  id: string;
  host_id: string;
  source_session_id: string;
  title: string;
  encrypted_script: Buffer;
  description: string | null;
  source_usage_count: number;
  source_success_count: number;
  executed_count: number;
  confidence: number;
  risk_hint: string | null;
  status: string;
  mode: string;
  is_new: number;
  created_at: string;
  updated_at: string;
};

export class QuickScriptRepository {
  readonly #database: DatabaseSync;
  readonly #cipher: AesGcmFieldCipher;

  constructor(database: DatabaseSync, cipher: AesGcmFieldCipher) {
    this.#database = database;
    this.#cipher = cipher;
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS quick_scripts (
        id TEXT PRIMARY KEY NOT NULL,
        host_id TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        encrypted_script BLOB NOT NULL,
        description TEXT,
        source_usage_count INTEGER NOT NULL DEFAULT 0,
        source_success_count INTEGER NOT NULL DEFAULT 0,
        executed_count INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        risk_hint TEXT,
        status TEXT NOT NULL DEFAULT 'suggested',
        mode TEXT NOT NULL DEFAULT 'rules',
        is_new INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quick_scripts_host ON quick_scripts(host_id);
    `);
  }

  list(hostId: string, includeDismissed = false): QuickScript[] {
    const rows = this.#database
      .prepare(
        `SELECT * FROM quick_scripts WHERE host_id = ?
         ${includeDismissed ? "" : "AND status != 'dismissed'"}
         ORDER BY CASE status WHEN 'pinned' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END,
                  confidence DESC, executed_count DESC`,
      )
      .all(hostId) as unknown as Row[];
    return rows.map((row) => this.#toRecord(row));
  }

  /** Merge a fresh generation (prototype merge semantics; see plan §13–14). */
  mergeGenerated(hostId: string, sessionId: string, incoming: readonly GeneratedScript[], mode: QuickScriptMode): number {
    return this.#transaction(() => {
      this.#database.prepare("UPDATE quick_scripts SET is_new = 0 WHERE host_id = ?").run(hostId);
      const existing = (this.#database
        .prepare("SELECT * FROM quick_scripts WHERE host_id = ?")
        .all(hostId) as unknown as Row[]).map((row) => this.#toRecord(row));
      let created = 0;
      for (const item of incoming) {
        const key = normalizeForMatch(item.script);
        const match = existing.find((row) => normalizeForMatch(row.script) === key);
        if (match) {
          if (match.status === "dismissed") {
            continue;
          }
          this.#database
            .prepare(
              `UPDATE quick_scripts SET title = ?, source_usage_count = ?, source_success_count = ?, confidence = ?,
                 description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
            )
            .run(
              item.title,
              item.sourceUsageCount ?? match.sourceUsageCount,
              item.sourceSuccessCount ?? match.sourceSuccessCount,
              item.confidence,
              item.description,
              new Date().toISOString(),
              match.id,
            );
          continue;
        }
        const now = new Date().toISOString();
        this.#insert(hostId, sessionId, item, mode, now);
        created += 1;
      }
      // Cap the visible pool: pinned always kept; suggested trimmed by
      // confidence; dismissed always kept (hidden by list()).
      const counts = this.#database
        .prepare(
          `SELECT status, COUNT(*) AS n FROM quick_scripts WHERE host_id = ? GROUP BY status`,
        )
        .all(hostId) as unknown as { status: string; n: number }[];
      const pinned = counts.find((entry) => entry.status === "pinned")?.n ?? 0;
      const suggestedCap = Math.max(0, MAX_POOL - pinned);
      this.#database
        .prepare(
          `DELETE FROM quick_scripts WHERE id IN (
             SELECT id FROM quick_scripts WHERE host_id = ? AND status = 'suggested'
             ORDER BY confidence DESC, executed_count DESC LIMIT -1 OFFSET ?
           )`,
        )
        .run(hostId, suggestedCap);
      return created;
    });
  }

  update(id: string, patch: QuickScriptPatch): QuickScript {
    const row = this.#row(id);
    const current = this.#toRecord(row);
    const script = patch.script ?? this.#decryptScript(row);
    const next: QuickScript = {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.script !== undefined ? { script: patch.script } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.executedCount !== undefined ? { executedCount: patch.executedCount } : {}),
      // Recording an execution (or any status change) retires the NEW badge.
      isNew: patch.executedCount !== undefined ? false : current.isNew,
      updatedAt: new Date().toISOString(),
    };
    this.#database
      .prepare(
        `UPDATE quick_scripts SET title = ?, encrypted_script = ?, status = ?, executed_count = ?,
           is_new = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.title,
        this.#cipher.encrypt(
          { recordType: "quick_script", recordId: id, vaultId: next.hostId, fieldName: "script" },
          Buffer.from(script, "utf8"),
        ),
        next.status,
        next.executedCount,
        next.isNew ? 1 : 0,
        next.updatedAt,
        id,
      );
    return next;
  }

  delete(id: string): void {
    this.#database.prepare("DELETE FROM quick_scripts WHERE id = ?").run(id);
  }

  deleteForHost(hostId: string): void {
    this.#database.prepare("DELETE FROM quick_scripts WHERE host_id = ?").run(hostId);
  }

  clearAll(): void {
    this.#database.exec("DELETE FROM quick_scripts");
  }

  #insert(hostId: string, sessionId: string, item: GeneratedScript, mode: QuickScriptMode, now: string): void {
    const id = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO quick_scripts (
           id, host_id, source_session_id, title, encrypted_script, description,
           source_usage_count, source_success_count, executed_count, confidence, risk_hint,
           status, mode, is_new, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'suggested', ?, 1, ?, ?)`,
      )
      .run(
        id,
        hostId,
        sessionId,
        item.title,
        this.#cipher.encrypt(
          { recordType: "quick_script", recordId: id, vaultId: hostId, fieldName: "script" },
          Buffer.from(item.script, "utf8"),
        ),
        item.description,
        item.sourceUsageCount ?? 0,
        item.sourceSuccessCount ?? 0,
        item.confidence,
        item.riskHint,
        mode,
        now,
        now,
      );
  }

  #row(id: string): Row {
    const row = this.#database.prepare("SELECT * FROM quick_scripts WHERE id = ?").get(id) as unknown as Row | undefined;
    if (!row) throw new Error(`Quick script ${id} not found`);
    return row;
  }

  #decryptScript(row: Row): string {
    return this.#cipher
      .decrypt(
        { recordType: "quick_script", recordId: row.id, vaultId: row.host_id, fieldName: "script" },
        row.encrypted_script,
      )
      .toString("utf8");
  }

  #toRecord(row: Row): QuickScript {
    return {
      id: row.id,
      hostId: row.host_id,
      sessionId: row.source_session_id,
      title: row.title,
      script: this.#decryptScript(row),
      description: row.description,
      sourceUsageCount: row.source_usage_count,
      sourceSuccessCount: row.source_success_count,
      executedCount: row.executed_count,
      confidence: row.confidence,
      riskHint: row.risk_hint,
      status: row.status as QuickScriptStatus,
      isNew: row.is_new === 1,
      mode: row.mode as QuickScriptMode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}
