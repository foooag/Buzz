import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Model,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { SshRuntime } from "../../../../src/main/domains/ssh/runtime";
import {
  AiAgentRuntime,
  createActiveContextCompactor,
} from "../../../../src/main/domains/ai/agent-runtime";
import type { AiHistoryRepository } from "../../../../src/main/domains/ai/history";
import type { AiModelRuntime } from "../../../../src/main/domains/ai/model-runtime";
import type { AiShellRiskRuntime } from "../../../../src/main/domains/ai/risk";
import type { AiAgentEvent } from "../../../../src/main/domains/ai/agent-types";

describe("Electron Pi Agent runtime", () => {
  it("runs prompts in Electron, emits wire events, and saves complete history", async () => {
    const history = historyRepository();
    const runtime = new AiAgentRuntime(
      modelRuntime([textResponse("Server ready")]),
      history,
      allowRisk(),
      ssh(),
    );
    const created = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];

    const completed = await runtime.prompt(
      "renderer-1",
      created.agentId,
      "Check server",
      (event) => events.push(event),
    );

    expect(completed.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: [
        expect.objectContaining({ type: "text", text: "Check server" }),
      ] }),
      expect.objectContaining({ role: "assistant", content: [
        expect.objectContaining({ type: "text", text: "Server ready" }),
      ] }),
    ]));
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agentStart", "messageStart", "messageUpdate", "messageEnd", "agentEnd",
    ]));
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({
      providerConfigId: "provider-1",
      sshSessionId: "ssh-1",
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "user" }),
        expect.objectContaining({
          role: "assistant",
          provider: "terminus:provider-1",
        }),
      ]),
    }));
    await expect(runtime.close("renderer-2", created.agentId)).rejects.toMatchObject({
      code: "AI_AGENT_NOT_FOUND",
    });
    await runtime.close("renderer-1", created.agentId);
    expect(runtime.activeCount()).toBe(0);
  });

  it("preserves reasoning blocks in application-owned message events", async () => {
    const runtime = new AiAgentRuntime(
      modelRuntime([reasoningResponse()]),
      historyRepository(),
      allowRisk(),
      ssh(),
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];

    const completed = await runtime.prompt(
      "renderer-1",
      agentId,
      "Think first",
      (event) => events.push(event),
    );

    expect(completed.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Check constraints" },
        { type: "text", text: "Done" },
      ],
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "messageUpdate",
        message: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({ type: "thinking" }),
          ]),
        }),
      }),
    ]));
  });

  it("reconstructs complete text and thinking when provider partials lag behind deltas", async () => {
    const history = historyRepository();
    const runtime = new AiAgentRuntime(
      modelRuntime([laggingPartialResponse()]),
      history,
      allowRisk(),
      ssh(),
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];

    const completed = await runtime.prompt(
      "renderer-1",
      agentId,
      "Inspect",
      (event) => events.push(event),
    );

    expect(completed.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "The user asked to inspect" },
        { type: "text", text: "当前容器正在运行" },
      ],
    });
    expect(events.filter((event) => event.type === "messageUpdate").at(-1))
      .toMatchObject({
        message: {
          content: [
            { type: "thinking", thinking: "The user asked to inspect" },
            { type: "text", text: "当前容器正在运行" },
          ],
        },
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
            expect.objectContaining({ type: "text", text: "当前容器正在运行" }),
          ],
        }),
      ]),
    }));
  });

  it("keeps the risk token in Electron while waiting for UI confirmation", async () => {
    const risk = confirmationRisk();
    const sshRuntime = ssh();
    const runtime = new AiAgentRuntime(
      modelRuntime([toolResponse(), textResponse("Inspection complete")]),
      historyRepository(),
      risk,
      sshRuntime,
      1_000,
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];
    const prompt = runtime.prompt("renderer-1", agentId, "Inspect", (event) => events.push(event));

    await vi.waitFor(() => expect(
      events.some((event) => event.type === "toolConfirmationRequired"),
    ).toBe(true));
    const request = events.find((event) => event.type === "toolConfirmationRequired");
    if (!request || request.type !== "toolConfirmationRequired") throw new Error("missing confirmation");
    expect(JSON.stringify(request)).not.toContain("main-process-token");
    expect(() => runtime.decideTool(
      "renderer-1",
      agentId,
      "wrong-confirmation",
      true,
    )).toThrowError(expect.objectContaining({ code: "AI_CONFIRMATION_UNAVAILABLE" }));

    runtime.decideTool(
      "renderer-1",
      agentId,
      request.confirmation.confirmationId,
      true,
    );
    expect(() => runtime.decideTool(
      "renderer-1",
      agentId,
      request.confirmation.confirmationId,
      true,
    )).toThrowError(expect.objectContaining({ code: "AI_CONFIRMATION_UNAVAILABLE" }));
    const completed = await prompt;
    expect(completed.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Inspection complete" }],
    });
    expect(risk.authorize).toHaveBeenCalledWith(
      agentId,
      "ssh-1",
      "example.test",
      "/tmp",
      "pwd",
      "main-process-token",
    );
    expect(sshRuntime.executeCommand).toHaveBeenCalledOnce();
  });

  it("rejects duplicate prompts and accepts steering only while running", async () => {
    const runtime = new AiAgentRuntime(
      modelRuntime([toolResponse(), textResponse("Adjusted")]),
      historyRepository(),
      confirmationRisk(),
      ssh(),
      1_000,
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];
    const first = runtime.prompt("renderer-1", agentId, "Inspect", (event) => events.push(event));

    await vi.waitFor(() => expect(
      events.some((event) => event.type === "toolConfirmationRequired"),
    ).toBe(true));
    await expect(runtime.prompt(
      "renderer-1",
      agentId,
      "duplicate",
      () => undefined,
    )).rejects.toMatchObject({ code: "AI_AGENT_BUSY" });
    expect(() => runtime.steer("renderer-1", agentId, "Use a safer check")).not.toThrow();
    const request = events.find((event) => event.type === "toolConfirmationRequired");
    if (!request || request.type !== "toolConfirmationRequired") throw new Error("missing confirmation");
    runtime.decideTool("renderer-1", agentId, request.confirmation.confirmationId, false);

    const completed = await first;
    expect(completed.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: "Use a safer check",
      }),
    ]));
    expect(() => runtime.steer("renderer-1", agentId, "too late"))
      .toThrowError(expect.objectContaining({ code: "AI_AGENT_NOT_RUNNING" }));
  });

  it("treats confirmation timeout as tool cancellation", async () => {
    const sshRuntime = ssh();
    const runtime = new AiAgentRuntime(
      modelRuntime([toolResponse(), textResponse("Timed out safely")]),
      historyRepository(),
      confirmationRisk(),
      sshRuntime,
      5,
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];

    const completed = await runtime.prompt(
      "renderer-1",
      agentId,
      "Inspect",
      (event) => events.push(event),
    );

    expect(completed.status).toBe("idle");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "toolEnd", isError: true }),
    ]));
    expect(sshRuntime.executeCommand).not.toHaveBeenCalled();
  });

  it("aborts an Agent that is waiting for tool confirmation", async () => {
    const sshRuntime = ssh();
    const runtime = new AiAgentRuntime(
      modelRuntime([toolResponse(), abortedResponse()]),
      historyRepository(),
      confirmationRisk(),
      sshRuntime,
      1_000,
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    const events: AiAgentEvent[] = [];
    const prompt = runtime.prompt(
      "renderer-1",
      agentId,
      "Inspect",
      (event) => events.push(event),
    );
    await vi.waitFor(() => expect(
      events.some((event) => event.type === "toolConfirmationRequired"),
    ).toBe(true));

    runtime.abort("renderer-1", agentId);
    const completed = await prompt;
    expect(completed.status).toBe("idle");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "toolEnd", isError: true }),
    ]));
    expect(completed.messages.at(-1)).toMatchObject({
      role: "assistant",
      stopReason: "aborted",
    });
    expect(sshRuntime.executeCommand).not.toHaveBeenCalled();
  });

  it("reuses the encrypted history session and reports save failure non-fatally", async () => {
    const history = historyRepository();
    const runtime = new AiAgentRuntime(
      modelRuntime([textResponse("One"), textResponse("Two")]),
      history,
      allowRisk(),
      ssh(),
    );
    const { agentId } = runtime.create("renderer-1", "provider-1", "ssh-1");
    await runtime.prompt("renderer-1", agentId, "First", () => undefined);
    await runtime.prompt("renderer-1", agentId, "Second", () => undefined);
    expect(history.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: "history-1",
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "assistant", provider: "terminus:provider-1" }),
      ]),
    }));

    const failingHistory = historyRepository();
    vi.mocked(failingHistory.save).mockImplementation(() => {
      throw new Error("database details");
    });
    const failingRuntime = new AiAgentRuntime(
      modelRuntime([textResponse("Still successful")]),
      failingHistory,
      allowRisk(),
      ssh(),
    );
    const failingAgent = failingRuntime.create(
      "renderer-1",
      "provider-1",
      "ssh-1",
    );
    const events: AiAgentEvent[] = [];
    const completed = await failingRuntime.prompt(
      "renderer-1",
      failingAgent.agentId,
      "Continue",
      (event) => events.push(event),
    );
    expect(completed.status).toBe("idle");
    expect(events.map((event) => event.type).slice(-2)).toEqual([
      "agentEnd",
      "historySaveFailed",
    ]);
    expect(JSON.stringify(events)).not.toContain("database details");
  });

  it("closes every agent owned by a destroyed renderer", async () => {
    const runtime = new AiAgentRuntime(
      modelRuntime([]),
      historyRepository(),
      allowRisk(),
      ssh(),
    );
    runtime.create("renderer-1", "provider-1", "ssh-1");
    runtime.create("renderer-1", "provider-1", "ssh-1");
    runtime.create("renderer-2", "provider-1", "ssh-1");

    await runtime.closeOwner("renderer-1");
    expect(runtime.activeCount()).toBe(1);
    await runtime.closeAll();
    expect(runtime.activeCount()).toBe(0);
  });

  it("compacts only active context and preserves the source transcript", async () => {
    const models = {
      complete: vi.fn(async () => assistantMessage([
        { type: "text", text: "Earlier work" },
      ])),
    } as unknown as AiModelRuntime;
    const compact = createActiveContextCompactor(
      models,
      "provider-1",
      { ...model(), contextWindow: 20 },
      { enabled: true, reserveTokens: 10, keepRecentTokens: 4 },
    );
    const messages = [
      { role: "user" as const, content: "a".repeat(2_000), timestamp: 1 },
      assistantMessage([{ type: "text", text: "old" }], "stop", 100),
      { role: "user" as const, content: "new", timestamp: 3 },
    ];

    const transformed = await compact(messages);

    expect(transformed[0]).toMatchObject({
      role: "user",
      content: expect.stringContaining("Earlier work"),
    });
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ content: "a".repeat(2_000) });
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

function reasoningResponse(): AssistantMessageEvent[] {
  const start = assistantMessage([]);
  const thought = assistantMessage([
    { type: "thinking", thinking: "Check constraints" },
  ]);
  const complete = assistantMessage([
    { type: "thinking", thinking: "Check constraints" },
    { type: "text", text: "Done" },
  ]);
  return [
    { type: "start", partial: start },
    { type: "thinking_start", contentIndex: 0, partial: start },
    {
      type: "thinking_delta",
      contentIndex: 0,
      delta: "Check constraints",
      partial: thought,
    },
    {
      type: "thinking_end",
      contentIndex: 0,
      content: "Check constraints",
      partial: thought,
    },
    { type: "text_start", contentIndex: 1, partial: thought },
    {
      type: "text_delta",
      contentIndex: 1,
      delta: "Done",
      partial: complete,
    },
    {
      type: "text_end",
      contentIndex: 1,
      content: "Done",
      partial: complete,
    },
    { type: "done", reason: "stop", message: complete },
  ];
}

function laggingPartialResponse(): AssistantMessageEvent[] {
  const start = assistantMessage([]);
  const thinkingStart = assistantMessage([{ type: "thinking", thinking: "" }]);
  const firstThinking = assistantMessage([{ type: "thinking", thinking: "The" }]);
  const textStart = assistantMessage([
    { type: "thinking", thinking: "The" },
    { type: "text", text: "" },
  ]);
  const firstText = assistantMessage([
    { type: "thinking", thinking: "The" },
    { type: "text", text: "当前" },
  ]);
  const staleComplete = assistantMessage([
    { type: "thinking", thinking: "The" },
    { type: "text", text: "当前" },
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
      delta: "当前",
      partial: firstText,
    },
    {
      type: "text_delta",
      contentIndex: 1,
      delta: "容器正在运行",
      partial: firstText,
    },
    {
      type: "text_end",
      contentIndex: 1,
      content: "当前容器正在运行",
      partial: firstText,
    },
    { type: "done", reason: "stop", message: staleComplete },
  ];
}

function toolResponse(): AssistantMessageEvent[] {
  const call = {
    type: "toolCall" as const,
    id: "call-1",
    name: "ssh_exec",
    arguments: { command: "pwd", cwd: "/tmp" },
  };
  const start = assistantMessage([]);
  const partial = assistantMessage([call], "toolUse");
  return [
    { type: "start", partial: start },
    { type: "toolcall_start", contentIndex: 0, partial },
    { type: "toolcall_end", contentIndex: 0, toolCall: call, partial },
    { type: "done", reason: "toolUse", message: partial },
  ];
}

function abortedResponse(): AssistantMessageEvent[] {
  const aborted = assistantMessage([], "aborted");
  return [{ type: "error", reason: "aborted", error: aborted }];
}

function assistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
  totalTokens = 2,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "terminus:provider-1",
    model: "model-test",
    usage: {
      input: totalTokens - 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0,
      totalTokens,
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
      title: "SSH AI session",
      providerConfigId: "provider-1",
      sshSessionId: "ssh-1",
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

function confirmationRisk(): AiShellRiskRuntime {
  return {
    assess: vi.fn(() => ({
      verdict: {
        kind: "needsConfirmation",
        level: "high",
        reason: "Confirmation required.",
        projectedEffect: "Runs a remote command.",
      },
      confirmationToken: "main-process-token",
      expiresInMs: 60_000,
    })),
    authorize: vi.fn(),
    discard: vi.fn(),
  } as unknown as AiShellRiskRuntime;
}

function ssh(): SshRuntime {
  return {
    host: vi.fn(() => "example.test"),
    executeCommand: vi.fn(async () => ({
      stdout: "/tmp\n",
      stderr: "",
      exitCode: 0,
      truncated: false,
    })),
  } as unknown as SshRuntime;
}
