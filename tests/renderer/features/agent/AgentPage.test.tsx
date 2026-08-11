import { render, screen } from "@testing-library/react";
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
    expect(screen.queryByRole("complementary", { name: "Host progress" })).toBeNull();
  });
});
