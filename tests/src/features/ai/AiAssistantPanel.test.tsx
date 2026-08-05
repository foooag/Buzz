import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderConfig } from "@/features/ai/aiConfigTypes";
import { AiAssistantPanel } from "@/features/ai/AiAssistantPanel";
import type { AiAgentClient } from "@/features/ai/aiAgentApi";
import type { AiAgentEvent, AiAgentSnapshot } from "@/features/ai/aiAgentTypes";

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
    await waitFor(() => expect(input).toBeEnabled());
    const providerSelect = screen.getByRole("combobox", { name: "Model provider" });
    expect(
      input.compareDocumentPosition(providerSelect) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "Check server" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Server ready")).toBeVisible());
    expect(screen.getByText("Check server")).toBeVisible();
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
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "检查端口" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const thinking = await screen.findByText("检查远程端口");
    expect(thinking).toBeVisible();
    expect(thinking.closest("details")).toHaveAttribute("open");
    expect(screen.queryByText("宿")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("检查完成")).toBeVisible());
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

function agentClient(
  run: (text: string, onEvent: (event: AiAgentEvent) => void) => AiAgentSnapshot,
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
