import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPage } from "@/features/agent/AgentPage";
import type {
  AgentClient,
  AgentMessage,
  AgentSnapshot,
} from "@/features/agent/agentTypes";
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

  it("preserves the composer while asynchronous agent creation completes", async () => {
    const client = fakeClient();
    let resolveCreate!: (snapshot: AgentSnapshot) => void;
    vi.mocked(client.create).mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(client.create).toHaveBeenCalled());
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "w");

    await act(async () => {
      resolveCreate({
        agentId: "a1",
        providerConfigId: "cfg-1",
        status: "idle",
        hosts: [],
        messages: [],
      });
    });

    expect(screen.getByLabelText("Message agent")).toBe(input);
    await typeComposer(input, "h");
    expect(input).toHaveValue("wh");
  });

  it("sends a prompt with parsed targets on submit", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(sendButton()).toBeEnabled());
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "uptime{Enter}");
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
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await typeComposer(screen.getByLabelText("Message agent"), "uptime{Enter}");

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
      const toolMessage = assistantMessage([{
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "host_exec",
        args: { hostId: "h1", command: "docker ps" },
        argsText: JSON.stringify({ hostId: "h1", command: "docker ps" }),
      }]);
      onEvent({ type: "messageStart", message: toolMessage });
      onEvent({ type: "messageEnd", message: toolMessage });
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
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await typeComposer(screen.getByLabelText("Message agent"), "docker ps{Enter}");

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
    await waitFor(() => expect(sendButton()).toBeEnabled());

    const submission = typeComposer(
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
          { type: "reasoning", text: "1." },
        ]),
      });
    });
    expect(await screen.findByText("1.")).toBeVisible();

    act(() => {
      emit?.({
        type: "messageUpdate",
        message: assistantMessage([
          { type: "reasoning", text: "1.70" },
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
          { type: "reasoning", text: "1.70" },
          { type: "text", text: "正在检查容器" },
        ], "stop"),
      });
      completePrompt?.();
    });
    await submission;
  });

  it("copies selected chat text from the context menu", async () => {
    const client = fakeClient();
    const clipboard = { writeText: vi.fn(async () => undefined) };
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    vi.mocked(client.prompt).mockResolvedValue({
      agentId: "a1",
      providerConfigId: "cfg-1",
      status: "idle",
      hosts: [],
      messages: [assistantMessage([
        { type: "text", text: "Docker service is healthy" },
      ], "stop")],
    });

    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await typeComposer(screen.getByLabelText("Message agent"), "status{Enter}");

    const response = await screen.findByText("Docker service is healthy");
    const range = document.createRange();
    range.selectNodeContents(response);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.contextMenu(response);
    await userEvent.click(await screen.findByRole("menuitem", { name: /Copy/ }));

    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalledWith(
        "Docker service is healthy",
      );
    });
    selection?.removeAllRanges();
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
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
          id: "user-snapshot",
          role: "user",
          content: [{ type: "text", text: "inspect containers" }],
        },
        assistantMessage([
          { type: "reasoning", text: "读取真实运行时状态" },
          { type: "text", text: "Docker 服务运行正常" },
        ], "stop"),
      ],
    });
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await typeComposer(
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
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await typeComposer(screen.getByLabelText("Message agent"), "uptime{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI provider returned 429: rate limit exceeded",
    );
    // Phase must not be stuck "streaming" — the Send button re-appears
    // (not the Abort button) once chat.status settles to "error".
    expect(await sendButton()).toBeEnabled();
  });

  it("resolves an official host directive into prompt targets", async () => {
    seedInventory();
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(sendButton()).toBeEnabled());
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "run @");
    await userEvent.click(
      await screen.findByRole("option", { name: /web-prod-01/ }),
    );
    await userEvent.click(screen.getByLabelText("Message agent"));
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(client.prompt).toHaveBeenCalledWith(
      "a1",
      "run :host[web-prod-01]{name=h1}",
      ["h1"],
      expect.any(Function),
    ));
    const chip = screen.getByLabelText("host: web-prod-01");
    expect(chip).toHaveTextContent("web-prod-01");
    expect(chip).toHaveAttribute("data-directive-id", "h1");
    expect(chip).not.toHaveTextContent("@web-prod-01");
    expect(screen.queryByText(
      "run :host[web-prod-01]{name=h1}",
      { exact: true },
    )).toBeNull();
  });

  it("expands an official group directive into its host targets", async () => {
    seedInventory();
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(sendButton()).toBeEnabled());
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "run @Prod");
    await userEvent.click(
      await screen.findByRole("option", { name: /Production/ }),
    );
    await userEvent.click(screen.getByLabelText("Message agent"));
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(client.prompt).toHaveBeenCalledWith(
      "a1",
      "run :group[Production]{name=g1}",
      ["h1"],
      expect.any(Function),
    ));
    expect(screen.getByLabelText("group: Production")).toHaveTextContent(
      "Production",
    );
  });

  it("resolves a host address in natural-language text into prompt targets", async () => {
    seedInventory();
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await typeComposer(
      screen.getByLabelText("Message agent"),
      "查看 10.0.0.10 的容器状态{Enter}",
    );

    await waitFor(() => expect(client.prompt).toHaveBeenCalledWith(
      "a1",
      "查看 10.0.0.10 的容器状态",
      ["h1"],
      expect.any(Function),
    ));
  });
});

function sendButton(): HTMLElement {
  return screen.getByRole("button", { name: "Send" });
}

async function typeComposer(input: HTMLElement, text: string): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());
  input = screen.getByLabelText("Message agent");
  const submit = text.endsWith("{Enter}");
  const content = submit ? text.slice(0, -"{Enter}".length) : text;
  await userEvent.click(input);
  fireEvent.keyDown(input, { key: "End" });
  if (content) {
    const previousValue = (input as HTMLTextAreaElement).value;
    await userEvent.paste(content);
    await waitFor(() => expect(input).toHaveValue(previousValue + content));
  }
  if (submit) await userEvent.keyboard("{Enter}");
}

function assistantMessage(
  content: Extract<AgentMessage, { role: "assistant" }>["content"],
  stopReason: "pending" | "stop" = "pending",
): Extract<AgentMessage, { role: "assistant" }> {
  return {
    id: "assistant-stream",
    role: "assistant",
    content,
    status: stopReason === "pending"
      ? { type: "running" }
      : { type: "complete", reason: "stop" },
  };
}
