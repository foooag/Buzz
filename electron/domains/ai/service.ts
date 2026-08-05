import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { SshRuntime } from "../ssh/runtime.js";
import { AppEncryptionProtector } from "../inventory/app-encryption.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { createE2eMasterKey } from "../inventory/service.js";
import { loadOrCreateMasterKey } from "../inventory/master-key.js";
import { AiHistoryRepository } from "./history.js";
import { openAiDatabase } from "./database.js";
import { AiModelRuntime } from "./model-runtime.js";
import { AiConfigRepository } from "./repository.js";
import { AiShellRiskRuntime } from "./risk.js";
import { AiAgentRuntime } from "./agent-runtime.js";

export type AiService = {
  configs: AiConfigRepository;
  history: AiHistoryRepository;
  models: AiModelRuntime;
  risk: AiShellRiskRuntime;
  agents: AiAgentRuntime;
  close(): Promise<void>;
};

export async function openAiService(
  dataDirectory: string,
  isolatedE2e: boolean,
  ssh: SshRuntime,
): Promise<AiService> {
  mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(
    dataDirectory,
    isolatedE2e ? "ai.e2e.sqlite3" : "ai.sqlite3",
  );
  let key: Buffer;
  if (isolatedE2e) {
    key = createE2eMasterKey();
  } else {
    const keyPath = path.join(dataDirectory, "master-key.bin");
    const protector = await AppEncryptionProtector.open(
      dataDirectory,
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
  const configs = AiConfigRepository.open(databasePath, cipher);
  const historyDatabase = openAiDatabase(databasePath);
  const history = new AiHistoryRepository(historyDatabase, cipher);
  const models = new AiModelRuntime(configs);
  const risk = new AiShellRiskRuntime();
  const agents = new AiAgentRuntime(models, history, risk, ssh);
  return {
    configs,
    history,
    models,
    risk,
    agents,
    async close() {
      await agents.closeAll();
      configs.close();
      historyDatabase.close();
      cipher.dispose();
    },
  };
}
