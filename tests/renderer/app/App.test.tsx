import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import type {
  AgentClient,
  AgentEvent,
  AgentSnapshot,
} from "@/features/agent/agentTypes";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";
import type { InventoryApi } from "@/features/inventory/inventoryApi";

describe("Termius-compatible application shell", () => {
  it("opens on Servers with the observed primary navigation and quick connect", async () => {
    render(<App />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Servers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "SFTP" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Port Forwarding" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Servers" })).toBeVisible();
    const quickConnect = await screen.findByRole("textbox", {
      name: "Find a host or enter an SSH command",
    });
    expect(quickConnect).toHaveAttribute(
      "placeholder",
      "Search servers or connect directly — try “ssh deploy@10.0.0.20”",
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("switches destinations without losing the desktop shell", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "SFTP" }));

    expect(screen.getByRole("heading", { name: /^SFTP$/ })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "SFTP" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps a streaming agent running while another destination is open", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    let emit: ((event: AgentEvent) => void) | undefined;
    let finishPrompt: ((snapshot: AgentSnapshot) => void) | undefined;
    const snapshot: AgentSnapshot = {
      agentId: "agent-1",
      providerConfigId: "provider-1",
      status: "idle",
      hosts: [],
      messages: [],
    };
    const agent: AgentClient = {
      create: vi.fn(async () => snapshot),
      prompt: vi.fn((_agentId, _text, _targets, onEvent) => {
        emit = onEvent;
        return new Promise<AgentSnapshot>((resolve) => {
          finishPrompt = resolve;
        });
      }),
      steer: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
      decideTool: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };

    render(
      <App
        agent={agent}
        aiConfig={providerApi()}
        inventory={{ listVaults: vi.fn(async () => []) } as unknown as InventoryApi}
      />,
    );

    await user.click(screen.getByRole("link", { name: "Agent" }));
    await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());
    const composer = screen.getByLabelText("Message agent");
    await user.click(composer);
    await user.paste("stream this");
    await waitFor(() => expect(composer).toHaveTextContent("stream this"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(emit).toBeDefined());

    act(() => {
      emit?.({ type: "agentStart" });
      emit?.({
        type: "messageStart",
        message: {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "reasoning", text: "Still thinking" }],
          status: { type: "running" },
        },
      });
    });
    expect(await screen.findByText("Still thinking")).toBeVisible();

    await user.click(screen.getByRole("link", { name: "Servers" }));
    expect(screen.getByTestId("agent-workspace")).not.toBeVisible();
    expect(agent.abort).not.toHaveBeenCalled();
    expect(agent.close).not.toHaveBeenCalled();

    const completedMessage = {
      id: "assistant-1",
      role: "assistant" as const,
      content: [
        { type: "reasoning" as const, text: "Still thinking, now complete" },
        { type: "text" as const, text: "Finished while hidden" },
      ],
      status: { type: "complete" as const, reason: "stop" as const },
    };
    await act(async () => {
      emit?.({ type: "messageEnd", message: completedMessage });
      const completedSnapshot = { ...snapshot, messages: [completedMessage] };
      emit?.({ type: "agentEnd", snapshot: completedSnapshot });
      finishPrompt?.(completedSnapshot);
      await Promise.resolve();
    });

    await user.click(screen.getByRole("link", { name: "Agent" }));
    expect(await screen.findByText("Finished while hidden")).toBeVisible();
    expect(screen.getByText("Still thinking, now complete")).toBeVisible();
    expect(agent.abort).not.toHaveBeenCalled();
    expect(agent.close).not.toHaveBeenCalled();
  });
});

function providerApi(): AiConfigApi {
  const provider: AiProviderConfig = {
    id: "provider-1",
    providerKind: "custom",
    name: "Test provider",
    baseUrl: "https://example.test",
    modelId: "test-model",
    credentialConfigured: true,
    isDefault: true,
    connectionStatus: "connected",
    capabilities: {
      streaming: "supported",
      toolCalling: "supported",
      structuredOutput: "supported",
      reasoning: "supported",
    },
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
  return { list: vi.fn(async () => [provider]) } as unknown as AiConfigApi;
}
