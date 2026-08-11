import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentPage } from "../../../../src/renderer/features/agent/AgentPage";
import type {
  AgentClient,
  AgentEvent,
} from "../../../../src/renderer/features/agent/agentTypes";
import type { AiConfigApi } from "../../../../src/renderer/features/ai/aiConfigTypes";
import type { AiSessionClient } from "../../../../src/renderer/features/ai/aiSessionApi";

describe("Agent conversation integration", () => {
  it("renders the event stream, tool result, and per-host completion", async () => {
    const stop = vi.fn();
    const client = agentClient((onEvent, onClose) => {
      for (const event of completedEvents()) onEvent(event);
      onClose?.();
      return stop;
    });
    render(
      <AgentPage
        agentClient={client}
        providerApi={providerApi()}
        sessionApi={sessionApi()}
      />,
    );

    const composer = await screen.findByRole("textbox", { name: "Agent command" });
    fireEvent.paste(composer, {
      clipboardData: {
        getData: () => ":host[web]{name=h1} uptime",
        types: ["text/plain"],
      },
    });
    const send = screen.getByRole("button", { name: "Send Agent command" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    expect(await screen.findByText("Host is healthy.")).toBeVisible();
    const progress = screen.getByRole("complementary", { name: "Host progress" });
    expect(within(progress).getByText("h1")).toBeVisible();
    expect(within(progress).getByText("success")).toBeVisible();
    expect(within(progress).getByText("uptime")).toBeVisible();
    expect(screen.getAllByText("up 1 day")).toHaveLength(2);
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});

function agentClient(
  stream: (
    onEvent: (event: AgentEvent) => void,
    onClose?: () => void,
  ) => () => void,
): AgentClient {
  return {
    create: vi.fn(async () => ({
      agentId: "agent-1",
      providerConfigId: "provider-1",
      status: "idle" as const,
      hosts: [],
      messages: [],
    })),
    streamPrompt: vi.fn((_agentId, _text, _targets, onEvent, _vaultId, onClose) =>
      stream(onEvent, onClose)),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

function completedEvents(): AgentEvent[] {
  const message = {
    role: "assistant" as const,
    content: [{ type: "text", text: "Host is healthy." }],
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
  return [
    { type: "agentStart" },
    { type: "messageStart", message: { ...message, content: [] } },
    {
      type: "toolStart",
      toolCallId: "tool-1",
      toolName: "host_exec",
      args: { hostId: "h1", command: "uptime" },
    },
    {
      type: "toolEnd",
      toolCallId: "tool-1",
      toolName: "host_exec",
      result: { hostId: "h1", stdout: "up 1 day", exitCode: 0 },
      isError: false,
    },
    { type: "messageEnd", message },
    {
      type: "agentEnd",
      snapshot: {
        agentId: "agent-1",
        providerConfigId: "provider-1",
        status: "idle",
        hosts: ["h1"],
        messages: [message],
      },
    },
  ];
}

function providerApi(): AiConfigApi {
  return {
    list: vi.fn(async () => [{
      id: "provider-1",
      providerKind: "ollama",
      name: "Local model",
      baseUrl: "http://127.0.0.1:11434",
      modelId: "test",
      credentialConfigured: true,
      isDefault: true,
      connectionStatus: "connected",
      capabilities: {
        streaming: "supported",
        toolCalling: "supported",
        structuredOutput: "untested",
        reasoning: "untested",
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }]),
  } as unknown as AiConfigApi;
}

function sessionApi(): AiSessionClient {
  return {
    list: vi.fn(async () => []),
    load: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
  } as unknown as AiSessionClient;
}
