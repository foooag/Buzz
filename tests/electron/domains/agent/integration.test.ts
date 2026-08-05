import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Model,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { MultiHostAgentRuntime } from "../../../../electron/domains/agent/agent-runtime.js";
import type { AgentHostResolver } from "../../../../electron/domains/agent/host-resolution.js";
import type { AiHistoryRepository } from "../../../../electron/domains/ai/history.js";
import type { AiModelRuntime } from "../../../../electron/domains/ai/model-runtime.js";
import type { AiShellRiskRuntime } from "../../../../electron/domains/ai/risk.js";
import type { SshHeadlessRuntime } from "../../../../electron/domains/ssh/headless.js";

describe("Multi-host agent integration", () => {
  it("orchestrates host_exec calls across hosts in tool-call order", async () => {
    const headless = fakeHeadless();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([
        toolResponse("host_exec", {
          hostId: "h1",
          command: "docker ps --format '{{.Names}}\\t{{.Status}}'",
          cwd: "$HOME",
        }),
        toolResponse("host_exec", {
          hostId: "h2",
          command: "docker run -d --name shop -p 8080:8080 shop/app:1.4.2",
          cwd: "$HOME",
        }),
        textResponse("Container is running on both hosts."),
      ]),
      historyRepository(),
      allowRisk(),
      headless,
      resolver(),
    );
    const { agentId } = runtime.create("owner-1", {
      providerConfigId: "cfg-1",
      targets: ["h1", "h2"],
    });
    const events: unknown[] = [];
    const completed = await runtime.prompt(
      "owner-1",
      agentId,
      "把 web-prod-01 上的容器同样运行在 web-prod-02 上",
      { targets: ["h1", "h2"] },
      (event) => events.push(event),
    );
    expect(completed.status).toBe("idle");
    const calls = vi.mocked(headless.exec).mock.calls.map(
      ([hostId, command]) => `${hostId}:${command}`,
    );
    expect(calls).toEqual([
      "h1:docker ps --format '{{.Names}}\\t{{.Status}}'",
      "h2:docker run -d --name shop -p 8080:8080 shop/app:1.4.2",
    ]);
    expect(events.map((event) => (event as { type: string }).type)).toEqual(
      expect.arrayContaining(["agentStart", "toolStart", "toolEnd", "agentEnd"]),
    );
    await runtime.close("owner-1", agentId);
  });
});

function modelRuntime(events: AssistantMessageEvent[][]): AiModelRuntime {
  let request = 0;
  return {
    model: vi.fn(() => model()),
    stream: vi.fn(() => {
      const stream = createAssistantMessageEventStream();
      const script = events[request++] ?? [];
      queueMicrotask(() => script.forEach((event) => stream.push(event)));
      return stream;
    }),
  } as unknown as AiModelRuntime;
}

function textResponse(text: string): AssistantMessageEvent[] {
  const partial = assistantMessage([{ type: "text", text }]);
  return [
    { type: "start", partial: assistantMessage([]) },
    { type: "text_start", contentIndex: 0, partial: assistantMessage([]) },
    { type: "text_delta", contentIndex: 0, delta: text, partial },
    { type: "text_end", contentIndex: 0, content: text, partial },
    { type: "done", reason: "stop", message: partial },
  ];
}

function toolResponse(name: string, args: Record<string, unknown>): AssistantMessageEvent[] {
  const call = {
    type: "toolCall" as const,
    id: `call-${name}`,
    name,
    arguments: args,
  };
  const partial = assistantMessage([call], "toolUse");
  return [
    { type: "start", partial: assistantMessage([]) },
    { type: "toolcall_start", contentIndex: 0, partial: assistantMessage([]) },
    { type: "toolcall_end", contentIndex: 0, toolCall: call, partial },
    { type: "done", reason: "toolUse", message: partial },
  ];
}

function assistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "terminus:provider-1",
    model: "model-test",
    usage: {
      input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  };
}

function model(): Model<string> {
  return {
    id: "model-test",
    name: "Test",
    api: "openai-completions",
    provider: "terminus:provider-1",
    baseUrl: "http://localhost",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}

function historyRepository(): AiHistoryRepository {
  return {
    save: vi.fn(() => ({
      id: "history-1",
      title: "Ops agent task",
      providerConfigId: "cfg-1",
      sshSessionId: "headless",
      encryptedBytes: 64,
      createdAt: "now",
      updatedAt: "now",
    })),
  } as unknown as AiHistoryRepository;
}

function allowRisk(): AiShellRiskRuntime {
  return {
    assess: vi.fn(() => ({ verdict: { kind: "allow" } })),
    authorize: vi.fn(),
    discard: vi.fn(),
  } as unknown as AiShellRiskRuntime;
}

function fakeHeadless() {
  return {
    open: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      truncated: false,
    })),
    close: vi.fn(async () => undefined),
    closeAll: vi.fn(async () => undefined),
    hosts: vi.fn(() => []),
    has: vi.fn(() => false),
  } as unknown as SshHeadlessRuntime;
}

function resolver(): AgentHostResolver {
  return {
    resolveProfile: vi.fn(async (hostId) => ({
      hostId,
      hostname: hostId,
      port: 22,
      username: "ubuntu",
      authKind: "password" as const,
      credentialRef: "cred-1",
      identityId: null,
      keepaliveInterval: null,
    })),
    groupHosts: vi.fn(() => ({ g1: ["h1", "h2"] })),
    resolveMentionLabel: vi.fn(() => undefined),
  };
}
