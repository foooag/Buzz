import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPage } from "@/features/agent/AgentPage";
import type { AgentClient } from "@/features/agent/agentTypes";
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
