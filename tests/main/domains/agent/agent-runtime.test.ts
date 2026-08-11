import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Model,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { MultiHostAgentRuntime } from "../../../../src/main/domains/agent/agent-runtime";
import type { AgentEvent } from "../../../../src/main/domains/agent/agent-types";
import type { AiHistoryRepository } from "../../../../src/main/domains/ai/history";
import type { AiModelRuntime } from "../../../../src/main/domains/ai/model-runtime";
import type { AiShellRiskRuntime } from "../../../../src/main/domains/ai/risk";
import type { InventoryRepository } from "../../../../src/main/domains/inventory/repository";
import type { SshHeadlessRuntime } from "../../../../src/main/domains/ssh/headless";

describe("MultiHostAgentRuntime", () => {
  it("creates an Agent, streams a prompt, and saves history", async () => {
    const history = historyRepository();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([textResponse("Hosts ready")]),
      history,
      allowRisk(),
      headless(),
      inventory(),
    );
    const created = runtime.create("renderer-1", {
      providerConfigId: "provider-1",
      vaultId: "v1",
      targets: ["h1"],
    });
    const events: AgentEvent[] = [];

    const completed = await runtime.prompt(
      "renderer-1",
      created.agentId,
      "Check :host[db]{name=h1}",
      ["h1"],
      (event) => events.push(event),
    );

    expect(completed.hosts).toEqual(["h1"]);
    expect(completed.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hosts ready" }],
    });
    expect(events.at(-1)).toMatchObject({ type: "agentEnd" });
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({
      title: "Ops agent task",
      providerConfigId: "provider-1",
      sshSessionId: "",
    }));
  });

  it("rejects requested targets outside the current vault", async () => {
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([]),
      historyRepository(),
      allowRisk(),
      headless(),
      inventory(),
    );
    const { agentId } = runtime.create("renderer-1", {
      providerConfigId: "provider-1",
      vaultId: "v1",
    });

    await expect(runtime.prompt(
      "renderer-1",
      agentId,
      "Check host",
      ["h3"],
      () => undefined,
    )).rejects.toMatchObject({ code: "AGENT_TARGET_NOT_ALLOWED" });
  });

  it("executes host tools through the headless channel and risk gate", async () => {
    const ssh = headless();
    vi.mocked(ssh.hosts).mockReturnValue([]);
    vi.mocked(ssh.exec).mockResolvedValue({
      stdout: "up",
      stderr: "",
      exitCode: 0,
      truncated: false,
    });
    const risk = allowRisk();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([
        hostToolResponse("h1", "docker ps"),
        hostToolResponse("h2", "docker run alpine"),
        textResponse("Containers checked"),
      ]),
      historyRepository(),
      risk,
      ssh,
      inventory(),
    );
    const { agentId } = runtime.create("renderer-1", {
      providerConfigId: "provider-1",
      vaultId: "v1",
    });

    await runtime.prompt(
      "renderer-1",
      agentId,
      "Check containers",
      ["h1", "h2"],
      () => undefined,
    );

    expect(ssh.open).toHaveBeenCalledWith("h1", expect.objectContaining({
      hostname: "db.example.test",
      credentialRef: "credential-1",
    }));
    expect(risk.authorize).toHaveBeenCalledWith(
      agentId,
      "h1",
      "db.example.test",
      "$HOME",
      "docker ps",
      undefined,
    );
    expect(vi.mocked(ssh.exec).mock.calls.map(([hostId, command]) => [hostId, command])).toEqual([
      ["h1", "docker ps"],
      ["h2", "docker run alpine"],
    ]);
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
  const start = assistantMessage([]);
  const partial = assistantMessage([{ type: "text", text }]);
  return [
    { type: "start", partial: start },
    { type: "text_start", contentIndex: 0, partial: start },
    { type: "text_delta", contentIndex: 0, delta: text, partial },
    { type: "text_end", contentIndex: 0, content: text, partial },
    { type: "done", reason: "stop", message: partial },
  ];
}

function hostToolResponse(hostId: string, command: string): AssistantMessageEvent[] {
  const call = {
    type: "toolCall" as const,
    id: "call-host-1",
    name: "host_exec",
    arguments: { hostId, command, cwd: "$HOME" },
  };
  const start = assistantMessage([]);
  const partial = { ...assistantMessage([call]), stopReason: "toolUse" as const };
  return [
    { type: "start", partial: start },
    { type: "toolcall_start", contentIndex: 0, partial },
    { type: "toolcall_end", contentIndex: 0, toolCall: call, partial },
    { type: "done", reason: "toolUse", message: partial },
  ];
}

function assistantMessage(
  content: AssistantMessage["content"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "terminus:provider-1",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function model(): Model<string> {
  return {
    id: "test-model",
    name: "Test",
    api: "openai-completions",
    provider: "terminus:provider-1",
    baseUrl: "https://example.test",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}

function historyRepository(): AiHistoryRepository {
  return {
    save: vi.fn(() => ({ id: "history-1" })),
  } as unknown as AiHistoryRepository;
}

function allowRisk(): AiShellRiskRuntime {
  return {
    assess: vi.fn(() => ({ verdict: { kind: "allow" } })),
    authorize: vi.fn(),
    discard: vi.fn(),
  } as unknown as AiShellRiskRuntime;
}

function headless(): SshHeadlessRuntime {
  return {
    hosts: vi.fn(() => []),
    open: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
  } as unknown as SshHeadlessRuntime;
}

function inventory(): InventoryRepository {
  return {
    listHosts: vi.fn(() => [
      {
        id: "h1",
        vaultId: "v1",
        groupId: "g1",
        name: "Database",
        address: "db.example.test",
        username: "root",
        authKind: "password",
        credentialRef: "credential-1",
      },
      {
        id: "h2",
        vaultId: "v1",
        groupId: "g1",
        name: "Worker",
        address: "worker.example.test",
        username: "root",
        authKind: "password",
        credentialRef: "credential-2",
      },
    ]),
    listGroups: vi.fn(() => [{ id: "g1", name: "Production" }]),
  } as unknown as InventoryRepository;
}
