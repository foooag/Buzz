import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPage } from "@/features/agent/AgentPage";
import type { AgentClient } from "@/features/agent/agentTypes";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";

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
  });

  it("sends a prompt with parsed targets on submit", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi()} />);
    const input = await screen.findByLabelText("Message agent");
    await userEvent.type(input, "uptime{Enter}");
    expect(client.prompt).toHaveBeenCalledWith(
      "a1",
      "uptime",
      [],
      expect.any(Function),
    );
  });

  it("shows the standing-by empty state when no provider is usable", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} providerApi={providerApi([])} />);
    expect(await screen.findByText("Agent standing by")).toBeVisible();
    expect(client.create).not.toHaveBeenCalled();
  });
});
