import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AppEncryptionProtector } from "../inventory/app-encryption.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { createE2eMasterKey } from "../inventory/service.js";
import { loadOrCreateMasterKey } from "../inventory/master-key.js";
import { openAiDatabase } from "../ai/database.js";
import type { AiConfigRepository } from "../ai/repository.js";
import type { AiHistoryRepository, AiSessionRecord, AiSessionSummary } from "../ai/history.js";
import type { AiModelRuntime } from "../ai/model-runtime.js";
import type { AiAgentRuntime } from "../ai/agent-runtime.js";
import type { SshRuntime } from "../ssh/runtime.js";
import type { QuickScript, QuickScriptGenerationResult, QuickScriptPatch } from "../../../shared/ipc/quickscripts/types.js";
import { aggregateCommands, extractExecutedCommands, normalizeForMatch } from "./extractor.js";
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildRulesScripts,
  parseGeneratedScripts,
} from "./generator.js";
import { QuickScriptRepository } from "./repository.js";

const GENERATION_TIMEOUT_MS = 60_000;

export type QuickScriptsService = {
  generate(input: { sshSessionId: string; useLlm?: boolean }): Promise<QuickScriptGenerationResult>;
  list(hostId: string, includeDismissed?: boolean): QuickScript[];
  update(id: string, patch: QuickScriptPatch): QuickScript;
  delete(id: string): void;
  deleteForHost(hostId: string): void;
  clearAll(): void;
};

export type QuickScriptsServiceDeps = {
  repository: QuickScriptRepository;
  configs: Pick<AiConfigRepository, "list">;
  models: Pick<AiModelRuntime, "complete">;
  history: Pick<AiHistoryRepository, "list" | "load">;
  agents: Pick<AiAgentRuntime, "sessionContext">;
  ssh: Pick<SshRuntime, "hostId">;
};

function resolveProviderConfigId(configs: Pick<AiConfigRepository, "list">): string | undefined {
  const usable = configs
    .list()
    .filter((config) => config.credentialConfigured || config.providerKind === "ollama");
  return usable.find((config) => config.isDefault)?.id ?? usable[0]?.id;
}

export function createQuickScriptsService(deps: QuickScriptsServiceDeps): QuickScriptsService {
  const { repository, configs, models, history, agents, ssh } = deps;

  function loadSession(sshSessionId: string): { messages: unknown[]; sessionId: string | undefined; title: string } {
    const live = agents.sessionContext(sshSessionId);
    if (live) {
      return { messages: [...live.messages], sessionId: live.sessionId, title: "SSH AI session" };
    }
    const summaries = history
      .list()
      .filter((summary: AiSessionSummary) => summary.sshSessionId === sshSessionId);
    const latest = summaries[0]; // list() 为 ORDER BY updated_at DESC
    if (latest) {
      const record = history.load(latest.id) as AiSessionRecord;
      return { messages: Array.isArray(record.messages) ? record.messages : [], sessionId: record.id, title: record.title };
    }
    return { messages: [], sessionId: undefined, title: "SSH AI session" };
  }

  return {
    async generate({ sshSessionId, useLlm }) {
      const startedAt = Date.now();
      const hostId = ssh.hostId(sshSessionId); // 终端已关闭时抛 SSH_SESSION_NOT_FOUND
      const session = loadSession(sshSessionId);
      const executed = extractExecutedCommands(session.messages);
      if (executed.length === 0) {
        return { hostId, createdCount: 0, mode: "empty", durationMs: Date.now() - startedAt, droppedCount: 0 };
      }
      const { items: aggregates, droppedCount } = aggregateCommands(executed);

      let generated = buildRulesScripts(aggregates, executed.length);
      let mode: "llm" | "rules" = "rules";
      const providerConfigId = useLlm === false ? undefined : resolveProviderConfigId(configs);
      if (providerConfigId && aggregates.length > 0) {
        try {
          const response = await models.complete(
            providerConfigId,
            {
              systemPrompt: GENERATION_SYSTEM_PROMPT,
              messages: [{
                role: "user",
                content: buildGenerationPrompt({ sessionTitle: session.title, aggregates }),
                timestamp: Date.now(),
              }],
            },
            { signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS) },
          );
          const ok = response.stopReason !== "error" && response.stopReason !== "aborted";
          const text = ok
            ? response.content
                .filter((part) => part.type === "text")
                .map((part) => (part as { text: string }).text)
                .join("\n")
                .trim()
            : "";
          const allowed = new Set(aggregates.map((aggregate) => normalizeForMatch(aggregate.command)));
          const stats = new Map(aggregates.map((aggregate) => [
            normalizeForMatch(aggregate.command),
            { sourceUsageCount: aggregate.usageCount, sourceSuccessCount: aggregate.successCount },
          ]));
          const parsed = text ? parseGeneratedScripts(text, allowed) : [];
          if (parsed.length > 0) {
            generated = parsed.map((item) => ({ ...item, ...stats.get(normalizeForMatch(item.script)) }));
            mode = "llm";
          }
        } catch {
          // 网络/超时失败 → 保持规则模式(PRD F4/N4)
        }
      }

      const createdCount = repository.mergeGenerated(hostId, session.sessionId ?? "", generated, mode);
      return { hostId, createdCount, mode, durationMs: Date.now() - startedAt, droppedCount };
    },

    list(hostId, includeDismissed) {
      return repository.list(hostId, includeDismissed);
    },
    update(id, patch) {
      return repository.update(id, patch);
    },
    delete(id) {
      repository.delete(id);
    },
    deleteForHost(hostId) {
      repository.deleteForHost(hostId);
    },
    clearAll() {
      repository.clearAll();
    },
  };
}

/**
 * 打开 quickscripts 数据库与共享主密钥。必须在 openAiService **之后**调用——
 * ai 服务在首次运行时创建 master-key.bin,而 loadOrCreateMasterKey 在
 * 「数据库已存在但密钥不存在」时拒绝生成新密钥(fail-closed)。
 */
export async function openQuickScriptsService(
  options: {
    dataDirectory: string;
    isolatedE2e: boolean;
  } & Omit<QuickScriptsServiceDeps, "repository">,
): Promise<QuickScriptsService & { close(): void }> {
  mkdirSync(options.dataDirectory, { recursive: true });
  const databasePath = path.join(
    options.dataDirectory,
    options.isolatedE2e ? "quickscripts.e2e.sqlite3" : "quickscripts.sqlite3",
  );
  let key: Buffer;
  if (options.isolatedE2e) {
    key = createE2eMasterKey();
  } else {
    const keyPath = path.join(options.dataDirectory, "master-key.bin");
    const protector = await AppEncryptionProtector.open(
      options.dataDirectory,
      existsSync(databasePath) || existsSync(keyPath),
    );
    try {
      key = await loadOrCreateMasterKey({
        keyPath,
        databaseExists: existsSync(databasePath),
        protector,
      });
    } finally {
      protector.dispose();
    }
  }
  const cipher = new AesGcmFieldCipher(key);
  key.fill(0);
  const database = openAiDatabase(databasePath);
  const repository = new QuickScriptRepository(database, cipher);
  const service = createQuickScriptsService({ ...options, repository });
  return {
    ...service,
    close() {
      database.close();
      cipher.dispose();
    },
  };
}
