// Isolated in its own file because vitest isolates module state per file: the
// AI SDK `Chat` instance driven by a full stream in a sibling test leaves
// scheduler/microtask state that can prevent the next `useChat` mount from
// committing. These tests only mount/rerender (no sendMessage), so they run
// alone in this file to avoid contamination from stream-driving tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AgentPage } from "@/features/agent/AgentPage";
import type { AgentClient } from "@/features/agent/agentTypes";
import { createDeterministicAiConfigApi } from "@/features/ai/deterministicAiApi";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";
import { useInventoryStore } from "@/features/inventory/inventoryStore";

function fakeClient(): AgentClient {
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

function providerApi(items: AiProviderConfig[] = [provider()]): AiConfigApi {
  return { list: vi.fn(async () => items) } as unknown as AiConfigApi;
}

beforeEach(() => {
  window.localStorage.clear();
  useInventoryStore.getState().setResources([], [], []);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentPage providers", () => {
  it("shows the standing-by empty state when no provider is usable", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi([])} />);
    expect(await screen.findByText("Agent standing by")).toBeVisible();
    expect(screen.getByLabelText("Message agent")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
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
