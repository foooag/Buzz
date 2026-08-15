import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(within(progress).getByText("done")).toBeVisible();
    expect(within(progress).getByText("uptime")).toBeVisible();
    const reasoning = screen.getByText("Reasoning").closest("details");
    expect(reasoning).toContainElement(screen.getByText("Ran 1 command"));
    expect(reasoning).toContainElement(screen.getByText("host_exec"));
    fireEvent.click(screen.getByText("host_exec"));
    expect(screen.getByText("up 1 day")).toBeVisible();
    expect(reasoning).not.toHaveTextContent("Host is healthy.");
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it("keeps streamed reasoning visible as its snapshot grows", async () => {
    let emit: ((event: AgentEvent) => void) | undefined;
    const stop = vi.fn();
    const client = agentClient((onEvent) => {
      emit = onEvent;
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
        getData: () => "Think first",
        types: ["text/plain"],
      },
    });
    const send = screen.getByRole("button", { name: "Send Agent command" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    await waitFor(() => expect(emit).toBeTypeOf("function"));
    const events = reasoningEvents();
    act(() => {
      for (const event of events.slice(0, 3)) emit?.(event);
    });
    const reasoningLabel = await screen.findByText("Reasoning");
    const reasoning = reasoningLabel.closest("details");
    const reasoningContent = reasoning?.querySelector("p");
    expect(reasoningContent?.textContent).toBe("The");

    const updates = [
      "The user asked to inspect the live Agent stream",
      "The user asked to inspect the live Agent stream carefully",
    ];
    for (const [index, expected] of updates.entries()) {
      act(() => emit?.(events[index + 3]));
      await waitFor(() =>
        expect(reasoningContent?.textContent).toBe(expected),
      );
    }
    expect(reasoning).toHaveAttribute("open");
    expect(screen.getAllByText("Reasoning")).toHaveLength(1);

    act(() => {
      for (const event of events.slice(5)) emit?.(event);
    });
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it("groups reasoning from the whole turn before the response", async () => {
    const client = agentClient((onEvent, onClose) => {
      for (const event of interleavedReasoningEvents()) onEvent(event);
      onClose?.();
      return vi.fn();
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
        getData: () => "Inspect and summarize",
        types: ["text/plain"],
      },
    });
    const send = screen.getByRole("button", { name: "Send Agent command" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    const firstAnswer = await screen.findByText("First answer fragment.");
    const reasoningLabels = screen.getAllByText("Reasoning");
    expect(reasoningLabels).toHaveLength(1);
    const reasoning = reasoningLabels[0]?.closest("details");
    expect(reasoning).toHaveTextContent("First reasoning step.");
    expect(reasoning).toHaveTextContent("Second reasoning step.");
    expect(reasoning).not.toHaveTextContent("First answer fragment.");
    expect(
      reasoning?.compareDocumentPosition(firstAnswer) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
  const reasoning = {
    ...message,
    content: [{ type: "thinking" as const, thinking: "Checking host health." }],
    stopReason: "toolUse" as const,
  };
  return [
    { type: "agentStart" },
    { type: "messageStart", message: { ...reasoning, content: [] } },
    { type: "messageUpdate", message: reasoning },
    { type: "messageEnd", message: reasoning },
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
    { type: "messageStart", message: { ...message, content: [] } },
    {
      type: "messageUpdate",
      message: {
        ...message,
        content: [{ type: "text", text: "Host is" }],
      },
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

function reasoningEvents(): AgentEvent[] {
  const partial = {
    role: "assistant" as const,
    content: [{ type: "thinking", thinking: "The" }],
    stopReason: "pending" as const,
    timestamp: Date.now(),
  };
  const continued = {
    ...partial,
    content: [
      {
        type: "thinking" as const,
        thinking: "The user asked to inspect the live Agent stream",
      },
    ],
  };
  const complete = {
    ...partial,
    content: [
      {
        type: "thinking" as const,
        thinking: "The user asked to inspect the live Agent stream carefully",
      },
      { type: "text", text: "Done" },
    ],
    stopReason: "stop" as const,
  };
  return [
    { type: "agentStart" },
    { type: "messageStart", message: { ...partial, content: [] } },
    { type: "messageUpdate", message: partial },
    { type: "messageUpdate", message: continued },
    { type: "messageUpdate", message: complete },
    { type: "messageEnd", message: complete },
    {
      type: "agentEnd",
      snapshot: {
        agentId: "agent-1",
        providerConfigId: "provider-1",
        status: "idle",
        hosts: [],
        messages: [complete],
      },
    },
  ];
}

function interleavedReasoningEvents(): AgentEvent[] {
  const messages = [
    {
      role: "assistant" as const,
      content: [{ type: "thinking" as const, thinking: "First reasoning step." }],
      stopReason: "toolUse" as const,
      timestamp: 1,
    },
    {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "First answer fragment." }],
      stopReason: "toolUse" as const,
      timestamp: 2,
    },
    {
      role: "assistant" as const,
      content: [{ type: "thinking" as const, thinking: "Second reasoning step." }],
      stopReason: "toolUse" as const,
      timestamp: 3,
    },
    {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Final answer fragment." }],
      stopReason: "stop" as const,
      timestamp: 4,
    },
  ];
  return [
    { type: "agentStart" },
    ...messages.flatMap((message): AgentEvent[] => [
      { type: "messageStart", message: { ...message, content: [] } },
      { type: "messageUpdate", message },
      { type: "messageEnd", message },
    ]),
    {
      type: "agentEnd",
      snapshot: {
        agentId: "agent-1",
        providerConfigId: "provider-1",
        status: "idle",
        hosts: [],
        messages,
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
