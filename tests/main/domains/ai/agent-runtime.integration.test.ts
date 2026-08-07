import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { SshRuntime } from "../../../../src/main/domains/ssh/runtime";
import { AesGcmFieldCipher } from "../../../../src/main/domains/inventory/field-cipher";
import { AiAgentRuntime } from "../../../../src/main/domains/ai/agent-runtime";
import { createAiCommandHandlers } from "../../../../src/main/domains/ai/commands";
import { openAiDatabase } from "../../../../src/main/domains/ai/database";
import { AiHistoryRepository } from "../../../../src/main/domains/ai/history";
import type { AiModelRuntime } from "../../../../src/main/domains/ai/model-runtime";
import type { AiShellRiskRuntime } from "../../../../src/main/domains/ai/risk";
import type { AiService } from "../../../../src/main/domains/ai/service";

describe("Electron AI Agent IPC integration", () => {
  it("streams an Agent prompt and saves the raw transcript encrypted", async () => {
    const database = openAiDatabase(":memory:");
    const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 0x45));
    const history = new AiHistoryRepository(database, cipher);
    const models = modelRuntime();
    const agents = new AiAgentRuntime(
      models,
      history,
      {
        assess: vi.fn(() => ({ verdict: { kind: "allow" } })),
        authorize: vi.fn(),
        discard: vi.fn(),
      } as unknown as AiShellRiskRuntime,
      {
        host: vi.fn(() => "integration.example"),
      } as unknown as SshRuntime,
    );
    const service = {
      configs: {}, models, history, risk: {}, agents, close: vi.fn(),
    } as unknown as AiService;
    const emitted: unknown[] = [];
    const handlers = createAiCommandHandlers(service, (_streamId, event) => {
      emitted.push(event);
    });
    const context = {
      ownerId: "renderer-integration",
      streamId: "prompt-stream",
      fallback: vi.fn(),
    };

    const created = await handlers.ai_agent_create?.({
      providerConfigId: "provider-integration",
      sshSessionId: "ssh-integration",
    }, context);
    if (!created?.ok) throw new Error("Agent creation failed.");
    const agentId = (created.data as { agentId: string }).agentId;
    const completed = await handlers.ai_agent_prompt?.({
      agentId,
      text: "Run the integration prompt",
    }, context);

    expect(completed).toMatchObject({
      ok: true,
      data: {
        status: "idle",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "assistant" }),
        ]),
      },
    });
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "messageUpdate" }),
      expect.objectContaining({ type: "agentEnd" }),
    ]));
    const stored = database.prepare(
      "SELECT encrypted_messages FROM ai_sessions LIMIT 1",
    ).get()?.encrypted_messages as Uint8Array;
    expect(Buffer.from(stored).includes(Buffer.from("integration answer"))).toBe(false);
    const saved = history.load(history.list()[0].id);
    expect(saved.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "assistant",
        provider: "terminus:provider-integration",
      }),
    ]));

    await agents.closeAll();
    database.close();
    cipher.dispose();
  });
});

function modelRuntime(): AiModelRuntime {
  const model = testModel();
  return {
    model: vi.fn(() => model),
    stream: vi.fn(() => {
      const stream = createAssistantMessageEventStream();
      const start = assistant([]);
      const complete = assistant([{ type: "text", text: "integration answer" }]);
      queueMicrotask(() => {
        stream.push({ type: "start", partial: start });
        stream.push({ type: "text_start", contentIndex: 0, partial: start });
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "integration answer",
          partial: complete,
        });
        stream.push({
          type: "text_end",
          contentIndex: 0,
          content: "integration answer",
          partial: complete,
        });
        stream.push({ type: "done", reason: "stop", message: complete });
      });
      return stream;
    }),
  } as unknown as AiModelRuntime;
}

function testModel(): Model<string> {
  return {
    id: "integration-model",
    name: "Integration model",
    api: "openai-completions",
    provider: "terminus:provider-integration",
    baseUrl: "http://127.0.0.1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}

function assistant(content: AssistantMessage["content"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "terminus:provider-integration",
    model: "integration-model",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
