import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPage } from "@/features/agent/AgentPage";
import type { AgentClient, AgentMessage } from "@/features/agent/agentTypes";
import { createDeterministicAiConfigApi } from "@/features/ai/deterministicAiApi";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { Group, Host, Identity } from "@/shared/types";

const timestamp = "2026-08-05T00:00:00.000Z";

function seedInventory() {
  const groups: Group[] = [{
    id: "g1",
    vaultId: "v1",
    parentId: null,
    name: "Production",
    color: "coral",
    count: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  const hosts: Host[] = [{
    id: "h1",
    vaultId: "v1",
    groupId: "g1",
    name: "web-prod-01",
    address: "10.0.0.10",
    username: "ubuntu",
    tags: [],
    notes: "",
    status: "online",
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  useInventoryStore.getState().setResources(
    groups,
    hosts,
    [] as Identity[],
  );
}

function fakeClient() {
  return {
    create: vi.fn(async () => ({
      agentId: "a1",
      providerConfigId: "cfg-1",
      status: "idle",
      hosts: [],
      messages: [],
    })),
    prompt: vi.fn(async () => ({
      agentId: "a1",
      providerConfigId: "cfg-1",
      status: "idle",
      hosts: [],
      messages: [],
    })),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as AgentClient;
}

function providerApi(items: AiProviderConfig[] = [provider()]): AiConfigApi {
  return { list: vi.fn(async () => items) } as unknown as AiConfigApi;
}

function provider(): AiProviderConfig {
  return {
    id: "cfg-1",
    providerKind: "anthropic",
    name: "Claude",
    baseUrl: "https://api.anthropic.com",
    modelId: "claude-sonnet-5",
    credentialConfigured: true,
    isDefault: true,
    connectionStatus: "connected",
    capabilities: {
      streaming: "supported",
      toolCalling: "supported",
      structuredOutput: "supported",
      reasoning: "untested",
    },
    createdAt: "now",
    updatedAt: "now",
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useInventoryStore.getState().setResources([], [], []);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AgentPage", () => {
  it("creates an agent and renders the prototype composer", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await screen.findByLabelText("Message agent");
    await waitFor(() => expect(client.create).toHaveBeenCalledWith({
      providerConfigId: "cfg-1",
    }));
    expect(screen.getByRole("heading", { name: "Agent" })).toBeVisible();
    expect(screen.getByText("Agent standing by")).toBeVisible();
    expect(screen.getByText("Claude · claude-sonnet-5")).toBeVisible();
    expect(screen.queryByText("No provider configured")).toBeNull();
  });

  it("sends a prompt with parsed targets on submit", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Message agent")).toBeEnabled();
    });
    const input = screen.getByLabelText("Message agent");
    await userEvent.type(input, "uptime{Enter}");
    expect(client.prompt).toHaveBeenCalledWith(
      "a1",
      "uptime",
      [],
      expect.any(Function),
    );
  });

  it("prints development send, receive, and completion messages", async () => {
    vi.stubEnv("MODE", "development");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const client = fakeClient();
    vi.mocked(client.prompt).mockImplementation(async (
      _agentId,
      _text,
      _targets,
      onEvent,
    ) => {
      onEvent({ type: "agentStart" });
      return {
        agentId: "a1",
        providerConfigId: "cfg-1",
        status: "idle",
        hosts: [],
        messages: [],
      };
    });
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());

    await userEvent.type(screen.getByLabelText("Message agent"), "uptime{Enter}");

    await waitFor(() => expect(debug).toHaveBeenCalledWith(
      "[agent-page:complete]",
      expect.any(Object),
    ));
    expect(debug).toHaveBeenCalledWith("[agent-page:send]", expect.any(Object));
    expect(debug).toHaveBeenCalledWith("[agent-page:receive]", { type: "agentStart" });
  });

  it("shows stderr and marks a non-zero command exit as failed", async () => {
    seedInventory();
    const client = fakeClient();
    vi.mocked(client.prompt).mockImplementation(async (
      _agentId,
      _text,
      _targets,
      onEvent,
    ) => {
      onEvent({
        type: "toolStart",
        toolCallId: "call-1",
        toolName: "host_exec",
        args: { hostId: "h1", command: "docker ps" },
      });
      onEvent({
        type: "toolEnd",
        toolCallId: "call-1",
        toolName: "host_exec",
        result: {
          details: {
            stdout: "",
            stderr: "permission denied while connecting to Docker",
            exitCode: 1,
          },
        },
        isError: false,
      });
      return {
        agentId: "a1",
        providerConfigId: "cfg-1",
        status: "idle",
        hosts: [],
        messages: [],
      };
    });
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());

    await userEvent.type(screen.getByLabelText("Message agent"), "docker ps{Enter}");

    const errorMessages = await screen.findAllByText(
      "permission denied while connecting to Docker",
    );
    expect(errorMessages).toHaveLength(2);
    errorMessages.forEach((message) => expect(message).toBeVisible());
    expect(screen.getByText("failed")).toBeVisible();
    expect(screen.getByText("error")).toBeVisible();
  });

  it("renders reasoning and text while an assistant message is streaming", async () => {
    const client = fakeClient();
    let emit: Parameters<AgentClient["prompt"]>[3] | undefined;
    let completePrompt: (() => void) | undefined;
    vi.mocked(client.prompt).mockImplementation((
      _agentId,
      _text,
      _targets,
      onEvent,
    ) => new Promise((resolve) => {
      emit = onEvent;
      completePrompt = () => resolve({
        agentId: "a1",
        providerConfigId: "cfg-1",
        status: "idle",
        hosts: [],
        messages: [],
      });
    }));
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());

    const submission = userEvent.type(
      screen.getByLabelText("Message agent"),
      "inspect containers{Enter}",
    );
    await waitFor(() => expect(emit).toBeDefined());

    act(() => {
      emit?.({
        type: "messageStart",
        message: assistantMessage([]),
      });
      emit?.({
        type: "messageUpdate",
        message: assistantMessage([
          { type: "thinking", thinking: "1." },
        ]),
      });
    });
    expect(await screen.findByText("1.")).toBeVisible();

    act(() => {
      emit?.({
        type: "messageUpdate",
        message: assistantMessage([
          { type: "thinking", thinking: "1.70" },
          { type: "text", text: "正在检查容器" },
        ]),
      });
    });
    expect(await screen.findByText("1.70")).toBeVisible();
    expect(screen.getByText("正在检查容器")).toBeVisible();

    act(() => {
      emit?.({
        type: "messageEnd",
        message: assistantMessage([
          { type: "thinking", thinking: "1.70" },
          { type: "text", text: "正在检查容器" },
        ], "stop"),
      });
      completePrompt?.();
    });
    await submission;
  });

  it("renders authoritative thinking and text from the prompt snapshot", async () => {
    const client = fakeClient();
    vi.mocked(client.prompt).mockResolvedValue({
      agentId: "a1",
      providerConfigId: "cfg-1",
      status: "idle",
      hosts: [],
      messages: [
        {
          role: "user",
          content: "inspect containers",
          timestamp: Date.now(),
        },
        assistantMessage([
          { type: "thinking", thinking: "读取真实运行时状态" },
          { type: "text", text: "Docker 服务运行正常" },
        ], "stop"),
      ],
    });
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());

    await userEvent.type(
      screen.getByLabelText("Message agent"),
      "inspect containers{Enter}",
    );

    expect(await screen.findByText("读取真实运行时状态")).toBeVisible();
    expect(screen.getByText("Docker 服务运行正常")).toBeVisible();
  });

  it("shows the concrete error when an agent request rejects", async () => {
    const client = fakeClient();
    vi.mocked(client.prompt).mockRejectedValue(
      new Error("AI provider returned 429: rate limit exceeded"),
    );
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());

    await userEvent.type(screen.getByLabelText("Message agent"), "uptime{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI provider returned 429: rate limit exceeded",
    );
  });

  it("resolves a friendly @ mention into prompt targets", async () => {
    seedInventory();
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Message agent")).toBeEnabled();
    });
    const input = screen.getByLabelText("Message agent");
    await userEvent.type(input, "run @");
    await userEvent.click(
      await screen.findByRole("option", { name: /web-prod-01/ }),
    );
    await userEvent.type(input, "uptime{Enter}");
    await waitFor(() => expect(client.prompt).toHaveBeenCalledWith(
      "a1",
      "run @web-prod-01 uptime",
      ["h1"],
      expect.any(Function),
    ));
  });

  it("shows the standing-by empty state when no provider is usable", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi([])} />);
    expect(await screen.findByText("Agent standing by")).toBeVisible();
    expect(client.create).not.toHaveBeenCalled();
  });

  it("reloads providers when the revision changes and reflects a newly configured one", async () => {
    const list = vi
      .fn<AiConfigApi["list"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([provider()]);
    const client = fakeClient();
    const { rerender } = render(
      <AgentPage
        agentClient={client}
        providerApi={{ list } as unknown as AiConfigApi}
      />,
    );
    expect(await screen.findByText("No provider configured")).toBeVisible();

    rerender(
      <AgentPage
        agentClient={client}
        providerApi={{ list } as unknown as AiConfigApi}
        providerRevision={1}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Claude · claude-sonnet-5")).toBeVisible();
    });
    expect(screen.queryByText("No provider configured")).toBeNull();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("reflects a provider configured through the AI settings flow using the real config api", async () => {
    const api = createDeterministicAiConfigApi([]);
    const client = fakeClient();
    const { rerender } = render(
      <AgentPage agentClient={client} providerApi={api} />,
    );
    expect(await screen.findByText("No provider configured")).toBeVisible();

    // The user adds a provider in the AI preferences section.
    await api.create({
      providerKind: "anthropic",
      name: "Claude",
      baseUrl: "https://api.anthropic.com",
      modelId: "claude-sonnet-5",
      apiKey: "sk-test",
      isDefault: true,
    });

    // Preferences close → providerRevision bump.
    rerender(
      <AgentPage agentClient={client} providerApi={api} providerRevision={1} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Claude · claude-sonnet-5")).toBeVisible();
    });
    expect(screen.queryByText("No provider configured")).toBeNull();
  });
});

function assistantMessage(
  content: Extract<AgentMessage, { role: "assistant" }>["content"],
  stopReason: Extract<AgentMessage, { role: "assistant" }>["stopReason"] = "pending",
): Extract<AgentMessage, { role: "assistant" }> {
  return {
    role: "assistant",
    content,
    stopReason,
    timestamp: Date.now(),
  };
}
