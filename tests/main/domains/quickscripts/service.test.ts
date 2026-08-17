import { describe, expect, it, vi } from "vitest";
import { AesGcmFieldCipher } from "../../../../src/main/domains/inventory/field-cipher";
import { openAiDatabase } from "../../../../src/main/domains/ai/database";
import { QuickScriptRepository } from "../../../../src/main/domains/quickscripts/repository";
import { buildRulesScripts, parseGeneratedScripts } from "../../../../src/main/domains/quickscripts/generator";
import { createQuickScriptsService } from "../../../../src/main/domains/quickscripts/service";
import type { AiProviderConfig } from "../../../../src/main/domains/ai/types";

const provider: AiProviderConfig = {
  id: "provider-1",
  providerKind: "anthropic",
  name: "Claude",
  baseUrl: "",
  modelId: "claude-sonnet-5",
  credentialConfigured: true,
  isDefault: true,
  connectionStatus: "untested",
  capabilities: { streaming: "untested", toolCalling: "untested", structuredOutput: "untested", reasoning: "untested" },
  createdAt: "",
  updatedAt: "",
};

const sessionMessages = [
  { role: "user", content: "check nginx", timestamp: 1 },
  {
    role: "assistant",
    content: [{ type: "toolCall", id: "t1", name: "ssh_exec", arguments: { command: "tail -n 30 /var/log/nginx/error.log", explanation: "read errors" } }],
    stopReason: "toolUse",
    timestamp: 2,
  },
  { role: "toolResult", toolCallId: "t1", toolName: "ssh_exec", content: [{ type: "text", text: JSON.stringify({ stdout: "ok", stderr: "", exitCode: 0, truncated: false }) }], isError: false, timestamp: 3 },
];

function createService(overrides: Partial<Parameters<typeof createQuickScriptsService>[0]> = {}) {
  const repository = new QuickScriptRepository(openAiDatabase(":memory:"), new AesGcmFieldCipher(Buffer.alloc(32, 9)));
  const complete = vi.fn(async () => ({
    role: "assistant",
    content: [{ type: "text", text: JSON.stringify([
      { title: "Read nginx errors", script: "tail -n 30 /var/log/nginx/error.log", description: "Latest errors.", riskHint: null, confidence: 0.9 },
    ]) }],
    stopReason: "stop",
    timestamp: 4,
  }));
  const service = createQuickScriptsService({
    repository,
    configs: { list: () => [provider] } as never,
    models: { complete } as never,
    history: { list: () => [], load: vi.fn() } as never,
    agents: { sessionContext: () => ({ messages: sessionMessages, sessionId: "session-live" }) } as never,
    ssh: { hostId: () => "host-1" } as never,
    ...overrides,
  });
  return { service, repository, complete };
}

describe("parseGeneratedScripts", () => {
  const allowed = new Set(["tail -n 30 /var/log/nginx/error.log", "df -h"]);
  it("accepts items whose script lines are verbatim allowed commands", () => {
    const items = parseGeneratedScripts(
      '```json\n[{"title":"T","script":"df -h\\ntail -n 30 /var/log/nginx/error.log","description":null,"riskHint":null,"confidence":0.8}]\n```',
      allowed,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "T", confidence: 0.8 });
  });
  it("drops items with invented or rewritten command lines", () => {
    const items = parseGeneratedScripts(
      '[{"title":"Bad","script":"rm -rf /","description":null,"riskHint":null,"confidence":0.9},{"title":"Ok","script":"df -h","description":null,"riskHint":null,"confidence":0.5}]',
      allowed,
    );
    expect(items.map((item) => item.title)).toEqual(["Ok"]);
  });
  it("returns empty for unparseable output", () => {
    expect(parseGeneratedScripts("not json at all", allowed)).toEqual([]);
  });
});

describe("buildRulesScripts", () => {
  it("titles by first line truncated to 30 chars and scales confidence by frequency", () => {
    const items = buildRulesScripts(
      [
        { command: "journalctl -u nginx -n 200 --no-pager extra", usageCount: 4, successCount: 3, cwds: [] },
        { command: "df -h", usageCount: 1, successCount: 1, cwds: [] },
      ],
      5,
    );
    expect(items[0].title.length).toBeLessThanOrEqual(31);
    expect(items[0].title.endsWith("…") || items[0].title.length <= 30).toBe(true);
    expect(items[0].confidence).toBeGreaterThan(items[1].confidence);
    expect(items[0].riskHint).toBeNull();
  });
});

describe("QuickScriptsService.generate", () => {
  it("uses the live agent context, calls the LLM, validates, and persists llm-mode scripts", async () => {
    const { service, repository } = createService();
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result).toMatchObject({ hostId: "host-1", createdCount: 1, mode: "llm", droppedCount: 0 });
    const listed = repository.list("host-1");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ title: "Read nginx errors", sessionId: "session-live", mode: "llm", sourceUsageCount: 1, sourceSuccessCount: 1 });
  });

  it("falls back to rules mode when the LLM output is invalid", async () => {
    const { service } = createService({
      models: { complete: vi.fn(async () => ({ role: "assistant", content: [{ type: "text", text: "garbage" }], stopReason: "stop", timestamp: 4 })) } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("rules");
    expect(result.createdCount).toBeGreaterThan(0);
  });

  it("falls back to rules mode when the LLM call throws or errors", async () => {
    const { service } = createService({
      models: { complete: vi.fn(async () => { throw new Error("network down"); }) } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("rules");
  });

  it("returns empty when the session has no ssh_exec calls", async () => {
    const { service } = createService({
      agents: { sessionContext: () => ({ messages: [{ role: "user", content: "hi", timestamp: 1 }], sessionId: "s" }) } as never,
      history: { list: () => [], load: vi.fn() } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result).toMatchObject({ mode: "empty", createdCount: 0 });
  });

  it("falls back to decrypted history when no live agent exists", async () => {
    const { service } = createService({
      agents: { sessionContext: () => undefined } as never,
      history: {
        list: () => [{ id: "h1", title: "T", providerConfigId: "p", sshSessionId: "ssh-1", messageCount: 1, lastStatus: "done", encryptedBytes: 10, createdAt: "", updatedAt: "" }],
        load: () => ({ id: "h1", title: "T", providerConfigId: "p", sshSessionId: "ssh-1", messageCount: 1, lastStatus: "done", encryptedBytes: 10, createdAt: "", updatedAt: "", messages: sessionMessages }),
      } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("llm");
  });

  it("honors useLlm=false with fully offline rules mode", async () => {
    const { service, complete } = createService();
    const result = await service.generate({ sshSessionId: "ssh-1", useLlm: false });
    expect(result.mode).toBe("rules");
    expect(complete).not.toHaveBeenCalled();
  });

  it("uses rules mode when no provider is configured", async () => {
    const { service, complete } = createService({
      configs: { list: () => [] } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("rules");
    expect(complete).not.toHaveBeenCalled();
  });
});
