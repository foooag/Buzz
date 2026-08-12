import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentPage } from "../../../../src/renderer/features/agent/AgentPage";
import type { AgentClient } from "../../../../src/renderer/features/agent/agentTypes";
import type { AiConfigApi } from "../../../../src/renderer/features/ai/aiConfigTypes";
import type { AiSessionClient } from "../../../../src/renderer/features/ai/aiSessionApi";

describe("AgentPage", () => {
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
