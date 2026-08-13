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

  it("restores and continues a selected Agent history session", async () => {
    const previousMessage = {
      role: "user" as const,
      content: "Check the fleet",
      timestamp: 1,
    };
    const history = {
      load: vi.fn(() => ({
        id: "history-7",
        title: "Fleet investigation",
        providerConfigId: "provider-1",
        sshSessionId: "",
        messageCount: 1,
        lastStatus: null,
        encryptedBytes: 64,
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:01:00.000Z",
        messages: [previousMessage],
      })),
      save: vi.fn(() => ({ id: "history-7" })),
    } as unknown as AiHistoryRepository;
    const models = modelRuntime([textResponse("Still healthy")]);
    const runtime = new MultiHostAgentRuntime(
      models,
      history,
      allowRisk(),
      headless(),
      inventory(),
    );

    const created = runtime.create("renderer-1", {
      providerConfigId: "provider-1",
      vaultId: "v1",
      historySessionId: "history-7",
    });

    expect(created.messages).toEqual([previousMessage]);
    await runtime.prompt("renderer-1", created.agentId, "Check again", [], () => undefined);
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({
      id: "history-7",
      title: "Fleet investigation",
      messages: expect.arrayContaining([previousMessage]),
    }));
  });

  it("streams complete reasoning when provider partials lag behind deltas", async () => {
    const history = historyRepository();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([laggingReasoningResponse()]),
      history,
      allowRisk(),
      headless(),
      inventory(),
    );
    const { agentId } = runtime.create("renderer-1", {
      providerConfigId: "provider-1",
      vaultId: "v1",
    });
    const events: AgentEvent[] = [];

    const completed = await runtime.prompt(
      "renderer-1",
      agentId,
      "Think first",
      [],
      (event) => events.push(event),
    );

    expect(events.filter((event) => event.type === "messageUpdate").at(-1))
      .toMatchObject({
        message: {
          content: [
            { type: "thinking", thinking: "The user asked to inspect" },
            { type: "text", text: "All systems ready" },
          ],
        },
      });
    expect(completed.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "The user asked to inspect" },
        { type: "text", text: "All systems ready" },
      ],
    });
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: [
            expect.objectContaining({
              type: "thinking",
              thinking: "The user asked to inspect",
            }),
            expect.objectContaining({ type: "text", text: "All systems ready" }),
          ],
        }),
      ]),
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

  it("includes the exact command and AI explanation in risk confirmations", async () => {
    const ssh = headless();
    vi.mocked(ssh.exec).mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      truncated: false,
    });
    const risk = confirmationRisk();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([
        hostToolResponse(
          "h1",
          "rm -rf /tmp/buzz-cache",
          "Recursively and permanently removes the Buzz cache directory.",
        ),
        textResponse("Cache removed"),
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
    const events: AgentEvent[] = [];

    const prompt = runtime.prompt(
      "renderer-1",
      agentId,
      "Clear the cache",
      ["h1"],
      (event) => events.push(event),
    );

    await vi.waitFor(() => expect(
      events.some((event) => event.type === "toolConfirmationRequired"),
    ).toBe(true));
    const request = events.find(
      (event) => event.type === "toolConfirmationRequired",
    );
    if (!request || request.type !== "toolConfirmationRequired") {
      throw new Error("missing confirmation");
    }
    expect(request.confirmation).toMatchObject({
      command: "rm -rf /tmp/buzz-cache",
      projectedEffect: "Recursively and permanently removes the Buzz cache directory.",
      reason: "Confirmation required.",
    });
    expect(JSON.stringify(request)).not.toContain("main-process-token");

    runtime.decideTool(
      "renderer-1",
      agentId,
      request.confirmation.confirmationId,
      true,
    );
    await prompt;

    expect(ssh.exec).toHaveBeenCalledWith(
      "h1",
      "rm -rf /tmp/buzz-cache",
      expect.objectContaining({ cwd: "$HOME" }),
    );
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

function laggingReasoningResponse(): AssistantMessageEvent[] {
  const start = assistantMessage([]);
  const thinkingStart = assistantMessage([{ type: "thinking", thinking: "" }]);
  const firstThinking = assistantMessage([{ type: "thinking", thinking: "The" }]);
  const textStart = assistantMessage([
    { type: "thinking", thinking: "The" },
    { type: "text", text: "" },
  ]);
  const firstText = assistantMessage([
    { type: "thinking", thinking: "The" },
    { type: "text", text: "All" },
  ]);
  return [
    { type: "start", partial: start },
    { type: "thinking_start", contentIndex: 0, partial: thinkingStart },
    {
      type: "thinking_delta",
      contentIndex: 0,
      delta: "The",
      partial: firstThinking,
    },
    {
      type: "thinking_delta",
      contentIndex: 0,
      delta: " user asked to inspect",
      partial: firstThinking,
    },
    {
      type: "thinking_end",
      contentIndex: 0,
      content: "The user asked to inspect",
      partial: firstThinking,
    },
    { type: "text_start", contentIndex: 1, partial: textStart },
    {
      type: "text_delta",
      contentIndex: 1,
      delta: "All",
      partial: firstText,
    },
    {
      type: "text_delta",
      contentIndex: 1,
      delta: " systems ready",
      partial: firstText,
    },
    {
      type: "text_end",
      contentIndex: 1,
      content: "All systems ready",
      partial: firstText,
    },
    { type: "done", reason: "stop", message: firstText },
  ];
}

function hostToolResponse(
  hostId: string,
  command: string,
  explanation = `Runs ${command} on the selected host.`,
): AssistantMessageEvent[] {
  const call = {
    type: "toolCall" as const,
    id: "call-host-1",
    name: "host_exec",
    arguments: {
      hostId,
      command,
      explanation,
      cwd: "$HOME",
    },
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

function confirmationRisk(): AiShellRiskRuntime {
  return {
    assess: vi.fn(() => ({
      verdict: {
        kind: "needsConfirmation",
        level: "high",
        reason: "Confirmation required.",
        projectedEffect: "",
      },
      confirmationToken: "main-process-token",
      expiresInMs: 60_000,
    })),
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
