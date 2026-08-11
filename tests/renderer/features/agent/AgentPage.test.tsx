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
});
