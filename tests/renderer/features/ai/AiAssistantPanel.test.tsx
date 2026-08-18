import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "@/features/ai/aiConfigTypes";
import { AiAssistantPanel } from "@/features/ai/AiAssistantPanel";
import type { AiAgentClient } from "@/features/ai/aiAgentApi";
import type { AiAgentEvent, AiAgentSnapshot } from "@/features/ai/aiAgentTypes";
import { createDeterministicQuickScriptApi } from "@/features/ai/deterministicQuickScriptApi";
import * as commandSnippets from "@/features/shell/commandSnippets";
import { listConnectionHistory, markConnectionConnected, recordConnectionAttempt } from "@/features/workspace/connectionHistory";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

const provider: AiProviderConfig = {
  id: "provider-1",
  providerKind: "openai",
  name: "GPT",
  baseUrl: "https://api.openai.com/v1",
  modelId: "gpt-test",
  credentialConfigured: true,
  isDefault: true,
  connectionStatus: "connected",
  capabilities: { streaming: "supported", toolCalling: "supported", structuredOutput: "untested", reasoning: "unsupported" },
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

function seedHost(sessionId = "ssh-1") {
  const historyId = recordConnectionAttempt({ hostId: "host-1", host: "web-prod-01", port: 22, username: "deploy" });
  markConnectionConnected(historyId, sessionId);
}

/** Lexical 0.49 的 beforeinput 依赖 getTargetRanges(jsdom 缺失),合成按键无法
    写入 contenteditable;粘贴则需要编辑器内有选区且插入异步落盘。与
    AgentPage.test.tsx 一致,用 paste 驱动输入:先聚焦并把光标放到段尾,再派发
    带 clipboardData 的 paste,最后等待文本真正进入编辑器。 */
async function paste(input: HTMLElement, text: string) {
  input.focus();
  const para = input.querySelector("p");
  if (para) {
    const range = document.createRange();
    range.selectNodeContents(para);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  fireEvent.paste(input, {
    clipboardData: {
      getData: () => text,
      types: ["text/plain"],
    },
  });
  await waitFor(() => expect(input.textContent).toBe(text));
}

describe("AiAssistantPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.MouseEvent = window.MouseEvent ?? class MouseEvent {};
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("runs the real Pi Agent stream for an SSH session", async () => {
    render(
      <AiAssistantPanel
        onClose={() => undefined}
        sshSessionId="ssh-1"
        providerApi={{ list: async () => [provider], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() }}
        agentClient={agentClient((_text, onEvent) => {
          const messages = [
            { role: "user" as const, content: "Check server", timestamp: 1 },
            assistant("Server ready", 2),
          ];
          onEvent({ type: "agentStart" });
          onEvent({ type: "messageStart", message: messages[0] });
          onEvent({ type: "messageStart", message: messages[1] });
          const result = snapshot(messages);
          onEvent({ type: "agentEnd", snapshot: result });
          return result;
        })}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    const providerSelect = screen.getByRole("combobox", { name: "Model provider" });
    expect(
      input.compareDocumentPosition(providerSelect) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await paste(input, "Check server");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Server ready")).toBeVisible());
    expect(screen.getByText("Check server")).toBeVisible();
  });

  it("renders assistant responses as Streamdown markdown", async () => {
    render(
      <AiAssistantPanel
        onClose={() => undefined}
        sshSessionId="ssh-1"
        providerApi={{ list: async () => [provider], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() }}
        agentClient={agentClient((_text, onEvent) => {
          const messages = [
            { role: "user" as const, content: "Summarize", timestamp: 1 },
            assistant("**Server ready** with `nginx`", 2),
          ];
          const result = snapshot(messages);
          onEvent({ type: "agentStart" });
          onEvent({ type: "agentEnd", snapshot: result });
          return result;
        })}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "Summarize");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const emphasis = await screen.findByText("Server ready");
    expect(emphasis).toHaveAttribute("data-streamdown", "strong");
    expect(screen.getByText("nginx")).toHaveAttribute(
      "data-streamdown",
      "inline-code",
    );
  });

  it("expands thinking content and hides incomplete text before a tool call", async () => {
    render(
      <AiAssistantPanel
        onClose={() => undefined}
        sshSessionId="ssh-1"
        providerApi={{ list: async () => [provider], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() }}
        agentClient={agentClient((_text, onEvent) => {
          const messages = [
            { role: "user" as const, content: "检查端口", timestamp: 1 },
            {
              role: "assistant" as const,
              content: [
                { type: "thinking" as const, thinking: "检查远程端口" },
                { type: "text" as const, text: "宿" },
                { type: "toolCall" as const, id: "call-1", name: "ssh_exec", arguments: { command: "ss -tlpn" } },
              ],
              stopReason: "toolUse" as const,
              timestamp: 2,
            },
            assistant("检查完成", 3),
          ];
          const result = snapshot(messages);
          onEvent({ type: "agentStart" });
          onEvent({ type: "agentEnd", snapshot: result });
          return result;
        })}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "检查端口");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const thinking = await screen.findByText("检查远程端口");
    expect(thinking).toBeVisible();
    expect(thinking.closest("details")).toHaveAttribute("open");
    expect(screen.queryByText("宿")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("检查完成")).toBeVisible());
  });

  it("keeps streamed thinking monotonic when updates and the final snapshot lag", async () => {
    let emit: ((event: AiAgentEvent) => void) | undefined;
    let finish: ((snapshot: AiAgentSnapshot) => void) | undefined;
    const completion = new Promise<AiAgentSnapshot>((resolve) => {
      finish = resolve;
    });
    const userMessage = {
      role: "user" as const,
      content: "Think first",
      timestamp: 1,
    };
    const partial = thinkingAssistant("The", 2);
    const complete = thinkingAssistant("The user asked to inspect the server", 2);
    const staleSnapshot = snapshot([userMessage, partial]);

    render(
      <AiAssistantPanel
        onClose={() => undefined}
        sshSessionId="ssh-1"
        providerApi={{ list: async () => [provider], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() }}
        agentClient={agentClient((_text, onEvent) => {
          emit = onEvent;
          return completion;
        })}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "Think first");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(emit).toBeTypeOf("function"));

    act(() => {
      emit?.({ type: "agentStart" });
      emit?.({ type: "messageStart", message: userMessage });
      emit?.({ type: "messageStart", message: partial });
      emit?.({ type: "messageUpdate", message: partial });
    });
    const thinkingLabel = await screen.findByText("Thinking");
    const partialThinking = thinkingLabel.closest("details");
    expect(partialThinking).toHaveTextContent("The");

    act(() => {
      emit?.({ type: "messageUpdate", message: complete });
    });
    await screen.findByText("The user asked to inspect the server");
    const completeThinking = screen.getByText("Thinking").closest("details");
    expect(completeThinking).not.toBe(partialThinking);

    act(() => {
      emit?.({ type: "messageUpdate", message: partial });
      emit?.({ type: "agentEnd", snapshot: staleSnapshot });
      finish?.(staleSnapshot);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeVisible());
    expect(completeThinking).toHaveTextContent("The user asked to inspect the server");
    expect(completeThinking).toHaveAttribute("open");
  });

  it("shows the command and AI interpretation in risk confirmations", async () => {
    let emit: ((event: AiAgentEvent) => void) | undefined;
    const completion = new Promise<AiAgentSnapshot>(() => undefined);
    const client = agentClient((_text, onEvent) => {
      emit = onEvent;
      return completion;
    });

    render(
      <AiAssistantPanel
        onClose={() => undefined}
        sshSessionId="ssh-1"
        providerApi={{ list: async () => [provider], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() }}
        agentClient={client}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "Restart nginx");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(emit).toBeTypeOf("function"));

    act(() => {
      emit?.({
        type: "toolStart",
        toolCallId: "tool-1",
        toolName: "ssh_exec",
        args: {
          command: "sudo systemctl restart nginx",
          explanation: "Restarts Nginx and may briefly interrupt active connections.",
        },
      });
      emit?.({
        type: "toolConfirmationRequired",
        confirmation: {
          confirmationId: "confirmation-1",
          level: "high",
          reason: "Privilege escalation requires confirmation.",
        },
      } as unknown as AiAgentEvent);
    });

    expect(screen.getByRole("alertdialog", {
      name: "Confirmation required",
    })).toBeVisible();
    expect(screen.getByText("sudo systemctl restart nginx")).toBeVisible();
    expect(screen.getByText(
      "Restarts Nginx and may briefly interrupt active connections.",
    )).toBeVisible();
    expect(screen.getByText("Privilege escalation requires confirmation.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Run command" }));
    expect(client.decideTool).toHaveBeenCalledWith(
      "agent-1",
      "confirmation-1",
      true,
    );
  });

  it("intercepts the typed /生成快捷指令 trigger without creating a message", async () => {
    seedHost();
    const client = agentClient(() => snapshot([]));
    const quickApi = createDeterministicQuickScriptApi([]);
    const generate = vi.spyOn(quickApi, "generate");
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={client} quickScriptApi={quickApi} />,
    );
    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "/生成快捷指令");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(client.prompt).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0); // 未进入消息流
  });

  it("selecting the slash command fires generation and never sends to the model", async () => {
    seedHost();
    const client = agentClient(() => snapshot([]));
    const quickApi = createDeterministicQuickScriptApi([]);
    const generate = vi.spyOn(quickApi, "generate");
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={client} quickScriptApi={quickApi} />,
    );
    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "/");
    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: /^\/生成快捷指令/ }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(client.prompt).not.toHaveBeenCalled();
    expect(input).toHaveTextContent(""); // removeOnExecute 剥离了触发词
  });

  it("lists a single quick-script option in the slash popover (no alias duplicate)", async () => {
    seedHost();
    const client = agentClient(() => snapshot([]));
    const quickApi = createDeterministicQuickScriptApi([]);
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={client} quickScriptApi={quickApi} />,
    );
    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "/");
    const popover = await screen.findByRole("listbox", { name: "Slash commands" });
    expect(within(popover).getAllByRole("option")).toHaveLength(1); // 只有 /生成快捷指令,别名不进浮层
    expect(within(popover).getByRole("option", { name: /^\/生成快捷指令/ })).toBeVisible();
    expect(within(popover).queryByRole("option", { name: /quick-script/ })).toBeNull();
  });

  it("shows suggestion cards after generation and executes them into the terminal", async () => {
    seedHost();
    const onRunCommand = vi.fn();
    const quickApi = createDeterministicQuickScriptApi([]);
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={agentClient(() => snapshot([]))} quickScriptApi={quickApi} onRunCommand={onRunCommand} />,
    );
    const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await paste(input, "/quick-script");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const card = await screen.findByRole("button", { name: "Quick script List services" });
    await userEvent.click(card);
    expect(onRunCommand).toHaveBeenCalledWith("systemctl list-units --type=service");
  });

  it("routes a risky script through the confirmation dialog", async () => {
    seedHost();
    const onRunCommand = vi.fn();
    const risky: QuickScript = {
      id: "qs-risk", hostId: "host-1", sessionId: "s", title: "Restart nginx",
      script: "sudo systemctl restart nginx", description: null, sourceUsageCount: 2,
      sourceSuccessCount: 2, executedCount: 0, confidence: 0.9, riskHint: "restarts nginx",
      status: "suggested", isNew: false, mode: "llm", createdAt: "", updatedAt: "",
    };
    const quickApi = createDeterministicQuickScriptApi([risky]);
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={agentClient(() => snapshot([]))} quickScriptApi={quickApi} onRunCommand={onRunCommand} />,
    );
    const card = await screen.findByRole("button", { name: "Quick script Restart nginx" });
    await userEvent.click(card);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeVisible();
    expect(onRunCommand).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Execute/ }));
    expect(onRunCommand).toHaveBeenCalledWith("sudo systemctl restart nginx");
  });

  it("saves a quick script as a global command snippet from the edit dialog", async () => {
    seedHost();
    const qs: QuickScript = {
      id: "qs-snippet",
      hostId: "host-1",
      sessionId: "ssh-1",
      title: "List services",
      script: "systemctl list-units --type=service",
      description: null,
      sourceUsageCount: 3,
      sourceSuccessCount: 3,
      executedCount: 0,
      confidence: 0.9,
      riskHint: null,
      status: "suggested",
      isNew: false,
      mode: "llm",
      createdAt: "",
      updatedAt: "",
    };
    const quickApi = createDeterministicQuickScriptApi([qs]);
    const changed = vi.fn();
    const subscribeSpy = vi.spyOn(commandSnippets, "subscribeCommandSnippets");
    const unsubscribe = commandSnippets.subscribeCommandSnippets(changed);

    render(
      <AiAssistantPanel
        onClose={() => undefined}
        sshSessionId="ssh-1"
        providerApi={providerApi}
        agentClient={agentClient(() => snapshot([]))}
        quickScriptApi={quickApi}
      />,
    );

    const card = await screen.findByRole("button", { name: "Quick script List services" });
    await userEvent.hover(card);
    await userEvent.click(screen.getByRole("button", { name: "Edit List services" }));
    expect(screen.getByText("Edit quick script")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Save as snippet" }));

    const snippets = JSON.parse(localStorage.getItem("terminus.commandSnippets") ?? "[]") as Array<{
      name: string;
      command: string;
    }>;
    expect(snippets).toContainEqual(
      expect.objectContaining({ name: "List services", command: "systemctl list-units --type=service" }),
    );
    expect(subscribeSpy).toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();

    unsubscribe();
    subscribeSpy.mockRestore();
  });

  it("does not render the section when the host cannot be resolved", async () => {
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-unknown" providerApi={providerApi} agentClient={agentClient(() => snapshot([]))} quickScriptApi={createDeterministicQuickScriptApi()} />,
    );
    await screen.findByRole("textbox", { name: "Message AI assistant" });
    expect(screen.queryByLabelText("Quick scripts")).toBeNull();
  });

  it("renders a resizable sidebar with default width and persists changes", () => {
    const providerApi = { list: async () => [] as AiProviderConfig[], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() };
    const { container } = render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} />,
    );
    const sidebar = screen.getByLabelText("AI Assistant");
    expect(sidebar).toHaveStyle({ width: "376px" });

    const handle = screen.getByRole("separator", { name: "Resize AI sidebar" }) as HTMLElement;
    expect(handle).toHaveAttribute("aria-valuenow", "376");
    expect(handle).toHaveAttribute("aria-valuemin", "320");
    expect(handle).toHaveAttribute("aria-valuemax", "720");

    fireEvent.mouseDown(handle, { clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 360 });
    fireEvent.mouseUp(window);

    expect(sidebar).toHaveStyle({ width: "416px" });
    expect(handle).toHaveAttribute("aria-valuenow", "416");
    expect(window.localStorage.getItem("terminus.aiSidebarWidth")).toBe("416");
    expect(container).toBeTruthy();
  });

  it("clamps the sidebar width to the supported range", () => {
    const providerApi = { list: async () => [] as AiProviderConfig[], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() };
    window.localStorage.setItem("terminus.aiSidebarWidth", "100");
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} />,
    );
    const sidebar = screen.getByLabelText("AI Assistant");
    expect(sidebar).toHaveStyle({ width: "320px" });
  });

  it("restores the saved width on mount and resets on double-click", async () => {
    window.localStorage.setItem("terminus.aiSidebarWidth", "520");
    const providerApi = { list: async () => [] as AiProviderConfig[], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() };
    render(
      <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} />,
    );
    const sidebar = screen.getByLabelText("AI Assistant");
    expect(sidebar).toHaveStyle({ width: "520px" });

    const handle = screen.getByRole("separator", { name: "Resize AI sidebar" });
    fireEvent.doubleClick(handle);
    await waitFor(() => expect(sidebar).toHaveStyle({ width: "376px" }));
  });
});

const providerApi = { list: async () => [provider], create: vi.fn(), update: vi.fn(), delete: vi.fn(), test: vi.fn(), probe: vi.fn() };

function agentClient(
  run: (
    text: string,
    onEvent: (event: AiAgentEvent) => void,
  ) => AiAgentSnapshot | Promise<AiAgentSnapshot>,
): AiAgentClient {
  return {
    create: vi.fn(async () => snapshot([])),
    prompt: vi.fn(async (_agentId, text, onEvent) => run(text, onEvent)),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

function thinkingAssistant(
  thinking: string,
  timestamp: number,
): Extract<AiAgentSnapshot["messages"][number], { role: "assistant" }> {
  return {
    role: "assistant",
    content: [{ type: "thinking", thinking }],
    stopReason: "pending",
    timestamp,
  };
}

function snapshot(messages: AiAgentSnapshot["messages"]): AiAgentSnapshot {
  return {
    agentId: "agent-1",
    providerConfigId: provider.id,
    sshSessionId: "ssh-1",
    status: "idle",
    messages,
  };
}

function assistant(text: string, timestamp: number): AiAgentSnapshot["messages"][number] {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    timestamp,
  };
}
