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

describe("MultiHostAgentRuntime", () => {
  it("creates an agent and completes a prompt with host targets", async () => {
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([textResponse("Ready")]),
      historyRepository(),
      allowRisk(),
      fakeHeadless(),
      resolver(),
    );
    const created = runtime.create("owner-1", {
      providerConfigId: "cfg-1",
      targets: ["h1"],
    });
    expect(created.snapshot.hosts).toEqual(["h1"]);
    const events: unknown[] = [];
    const completed = await runtime.prompt(
      "owner-1",
      created.agentId,
      "check h1",
      { targets: ["h1"] },
      (event) => events.push(event),
    );
    expect(completed.status).toBe("idle");
    expect(events.some((event) => (event as { type: string }).type === "agentEnd")).toBe(true);
    await runtime.close("owner-1", created.agentId);
    expect(runtime.activeCount()).toBe(0);
  });

  it("rejects a directive whose host is not in the turn targets", async () => {
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([]),
      historyRepository(),
      allowRisk(),
      fakeHeadless(),
      resolver(),
    );
    const { agentId } = runtime.create("owner-1", {
      providerConfigId: "cfg-1",
      targets: ["h1"],
    });
    await expect(runtime.prompt(
      "owner-1",
      agentId,
      "do something on @:host[other]{name=h2}",
      { targets: ["h1"] },
      () => undefined,
    )).rejects.toMatchObject({ code: "AGENT_TARGET_NOT_ALLOWED" });
    await runtime.close("owner-1", agentId);
  });

  it("runs host_exec on an allowed host through the headless channel", async () => {
    const headless = fakeHeadless();
    const risk = allowRisk();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([
        toolResponse("host_exec", { hostId: "h1", command: "uptime", cwd: "$HOME" }),
        textResponse("Checked"),
      ]),
      historyRepository(),
      risk,
      headless,
      resolver(),
    );
    const { agentId } = runtime.create("owner-1", {
      providerConfigId: "cfg-1",
      targets: ["h1"],
    });
    const events: unknown[] = [];
    await runtime.prompt(
      "owner-1",
      agentId,
      "run uptime on h1",
      { targets: ["h1"] },
      (event) => events.push(event),
    );
    expect(headless.exec).toHaveBeenCalledWith(
      "h1",
      "uptime",
      expect.objectContaining({ cwd: "$HOME" }),
    );
    expect(events.some((event) => (event as { type: string }).type === "toolEnd")).toBe(true);
    await runtime.close("owner-1", agentId);
  });

  it("waits for confirmation and executes an approved edited command", async () => {
    const headless = fakeHeadless();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([
        toolResponse("host_exec", { hostId: "h1", command: "rm -rf /tmp/x" }),
        textResponse("Done"),
      ]),
      historyRepository(),
      confirmationRisk(),
      headless,
      resolver(),
      1_000,
    );
    const { agentId } = runtime.create("owner-1", {
      providerConfigId: "cfg-1",
      targets: ["h1"],
    });
    const events: unknown[] = [];
    const prompt = runtime.prompt(
      "owner-1",
      agentId,
      "clean up",
      { targets: ["h1"] },
      (event) => events.push(event),
    );
    await vi.waitFor(() => expect(
      events.some((event) => (event as { type: string }).type === "toolConfirmationRequired"),
    ).toBe(true), { timeout: 4_000 });
    const request = events.find(
      (event) => (event as { type: string }).type === "toolConfirmationRequired",
    ) as { confirmation: { confirmationId: string } };
    runtime.decideTool(
      "owner-1",
      agentId,
      request.confirmation.confirmationId,
      true,
      "rm -rf /tmp/x.new",
    );
    await prompt;
    expect(headless.exec).toHaveBeenCalledWith(
      "h1",
      "rm -rf /tmp/x.new",
      expect.anything(),
    );
    await runtime.close("owner-1", agentId);
  });

  it("filters host_list results to allowed hosts", async () => {
    const headless = fakeHeadless();
    const runtime = new MultiHostAgentRuntime(
      modelRuntime([
        toolResponse("host_list", { groupId: "g1" }),
        textResponse("Two hosts"),
      ]),
      historyRepository(),
      allowRisk(),
      headless,
      resolver(),
    );
    const { agentId } = runtime.create("owner-1", {
      providerConfigId: "cfg-1",
      targets: ["h1"],
    });
    const events: unknown[] = [];
    await runtime.prompt(
      "owner-1",
      agentId,
      "list the group",
      { targets: ["h1"] },
      (event) => events.push(event),
    );
    const toolEnd = events.find(
      (event) => (event as { type: string }).type === "toolEnd",
    ) as { result: unknown };
    expect(JSON.stringify(toolEnd.result)).toContain('["h1"]');
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

function confirmationRisk(): AiShellRiskRuntime {
  return {
    assess: vi.fn(() => ({
      verdict: {
        kind: "needsConfirmation",
        level: "high",
        reason: "Removes a path.",
        projectedEffect: "Deletes files.",
      },
      confirmationToken: "main-process-token",
      expiresInMs: 60_000,
    })),
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
  };
}
