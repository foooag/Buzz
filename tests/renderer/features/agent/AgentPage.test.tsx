import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentPage } from "../../../../src/renderer/features/agent/AgentPage";
import type { AgentClient } from "../../../../src/renderer/features/agent/agentTypes";
import type { AiConfigApi } from "../../../../src/renderer/features/ai/aiConfigTypes";
import type { AiSessionClient } from "../../../../src/renderer/features/ai/aiSessionApi";
import { useInventoryStore } from "../../../../src/renderer/features/inventory/inventoryStore";

describe("AgentPage", () => {
  beforeEach(() => {
    useInventoryStore.setState({
      vaults: {},
      vaultOrder: [],
      groups: {},
      hosts: {},
      identities: {},
      activeVaultId: null,
      status: "idle",
      errorCode: null,
    });
  });

  it("guides the user to configure a provider when none exist", async () => {
    render(
      <AgentPage
        agentClient={{} as AgentClient}
        providerApi={{ list: vi.fn(async () => []) } as unknown as AiConfigApi}
        sessionApi={{ list: vi.fn(async () => []) } as unknown as AiSessionClient}
      />,
    );

    expect(await screen.findByText(/Configure an AI provider/)).toBeVisible();
  });

  it("renders the prototype standby state without an empty progress rail", async () => {
    render(
      <AgentPage
        agentClient={{
          create: vi.fn(async () => ({
            agentId: "agent-1",
            providerConfigId: "provider-1",
            status: "idle",
            hosts: [],
            messages: [],
          })),
          close: vi.fn(async () => undefined),
        } as unknown as AgentClient}
        providerApi={{
          list: vi.fn(async () => [{
            id: "provider-1",
            name: "Local model",
            modelId: "qwen3",
            isDefault: true,
          }]),
        } as unknown as AiConfigApi}
        sessionApi={{ list: vi.fn(async () => []) } as unknown as AiSessionClient}
      />,
    );

    expect(await screen.findByText("Agent standing by")).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.getByText("Multi-host ops · headless SSH")).toBeVisible();
    expect(screen.getByRole("button", { name: "Chat history" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "AI provider" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Model" })).toBeVisible();
    expect(screen.getByText("qwen3")).toBeVisible();
    expect(screen.queryByRole("complementary", { name: "Host progress" })).toBeNull();
  });

  it("loads an Agent history session into both the conversation and Agent runtime", async () => {
    const user = userEvent.setup();
    const create = vi.fn(async () => ({
      agentId: crypto.randomUUID(),
      providerConfigId: "provider-1",
      status: "idle" as const,
      hosts: [],
      messages: [],
    }));
    const session = {
      id: "history-1",
      title: "Fleet check",
      providerConfigId: "provider-1",
      sshSessionId: "",
      messageCount: 2,
      lastStatus: "stop",
      encryptedBytes: 128,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:01:00.000Z",
    };

    render(
      <AgentPage
        agentClient={{
          create,
          close: vi.fn(async () => undefined),
        } as unknown as AgentClient}
        providerApi={{
          list: vi.fn(async () => [{
            id: "provider-1",
            name: "Local model",
            modelId: "qwen3",
            isDefault: true,
          }]),
        } as unknown as AiConfigApi}
        sessionApi={{
          list: vi.fn(async () => [session]),
          load: vi.fn(async () => ({
            ...session,
            messages: [
              { role: "user", content: "Inspect the fleet", timestamp: 1 },
              {
                role: "assistant",
                content: [{ type: "text", text: "All hosts are healthy." }],
                stopReason: "stop",
                timestamp: 2,
              },
            ],
          })),
        } as unknown as AiSessionClient}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Chat history" }));
    await user.click(await screen.findByText("Fleet check"));

    expect(await screen.findByText("Inspect the fleet")).toBeVisible();
    expect(screen.getByText("All hosts are healthy.")).toBeVisible();
    await waitFor(() => expect(create).toHaveBeenLastCalledWith({
      providerConfigId: "provider-1",
      historySessionId: "history-1",
      targets: [],
    }));
  });

  it("shows server suggestions only after the user types @", async () => {
    const timestamp = "2026-08-12T00:00:00.000Z";
    useInventoryStore.setState({
      activeVaultId: "vault-1",
      hosts: {
        "host-1": {
          id: "host-1",
          vaultId: "vault-1",
          groupId: null,
          name: "Production server",
          address: "10.11.70.52",
          username: "root",
          tags: [],
          notes: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    });

    render(
      <AgentPage
        agentClient={{
          create: vi.fn(async () => ({
            agentId: "agent-1",
            providerConfigId: "provider-1",
            status: "idle",
            hosts: [],
            messages: [],
          })),
          close: vi.fn(async () => undefined),
        } as unknown as AgentClient}
        providerApi={{
          list: vi.fn(async () => [{
            id: "provider-1",
            name: "Local model",
            modelId: "qwen3",
            isDefault: true,
          }]),
        } as unknown as AiConfigApi}
        sessionApi={{ list: vi.fn(async () => []) } as unknown as AiSessionClient}
      />,
    );

    const composer = await screen.findByRole("textbox", { name: "Agent command" });
    expect(screen.queryByText("Production server")).not.toBeInTheDocument();
    expect(screen.queryByText("10.11.70.52")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Suggestions" })).not.toBeInTheDocument();

    fireEvent.paste(composer, {
      clipboardData: {
        getData: () => "@",
        types: ["text/plain"],
      },
    });

    expect(await screen.findByRole("listbox", { name: "Suggestions" })).toBeVisible();
    expect(screen.getByText("Production server")).toBeVisible();
    expect(screen.getByText("10.11.70.52")).toBeVisible();
  });

  it("switches the Agent model from the composer", async () => {
    const user = userEvent.setup();
    const create = vi.fn(async ({ providerConfigId }: { providerConfigId: string }) => ({
      agentId: `agent-${providerConfigId}`,
      providerConfigId,
      status: "idle" as const,
      hosts: [],
      messages: [],
    }));

    render(
      <AgentPage
        agentClient={{
          create,
          close: vi.fn(async () => undefined),
        } as unknown as AgentClient}
        providerApi={{
          list: vi.fn(async () => [
            {
              id: "provider-1",
              providerKind: "ollama",
              name: "Local provider",
              modelId: "qwen3",
              isDefault: true,
            },
            {
              id: "provider-2",
              providerKind: "openai",
              name: "Cloud provider",
              modelId: "gpt-5",
              isDefault: false,
            },
          ]),
        } as unknown as AiConfigApi}
        sessionApi={{ list: vi.fn(async () => []) } as unknown as AiSessionClient}
      />,
    );

    await user.click(await screen.findByRole("combobox", { name: "Model" }));
    await user.click(screen.getByRole("option", { name: /gpt-5/ }));

    await waitFor(() => expect(create).toHaveBeenLastCalledWith({
      providerConfigId: "provider-2",
      targets: [],
    }));
    expect(screen.getByText("gpt-5")).toBeVisible();
  });
});
