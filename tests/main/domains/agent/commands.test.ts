import { describe, expect, it, vi } from "vitest";
import { isCommandName } from "../../../../src/shared/ipc/command-names";
import { createAgentCommandHandlers } from "../../../../src/main/domains/agent/commands";
import type { MultiHostAgentRuntime } from "../../../../src/main/domains/agent/agent-runtime";

describe("Agent lifecycle commands", () => {
  it("registers lifecycle commands without an invoke-based prompt", () => {
    for (const name of [
      "agent_create",
      "agent_steer",
      "agent_abort",
      "agent_decide_tool",
      "agent_close",
    ]) expect(isCommandName(name)).toBe(true);
    expect(isCommandName("agent_prompt")).toBe(false);
  });

  it("passes vault and targets into Agent creation", async () => {
    const runtime = {
      create: vi.fn(() => ({ agentId: "a1" })),
    } as unknown as MultiHostAgentRuntime;
    const handlers = createAgentCommandHandlers(runtime);
    const context = {
      ownerId: "renderer-1",
      fallback: vi.fn(),
    };

    await expect(handlers.agent_create?.({
      providerConfigId: "provider-1",
      vaultId: "vault-1",
      targets: ["h1"],
      historySessionId: "history-1",
    }, context)).resolves.toEqual({ ok: true, data: { agentId: "a1" } });
    expect(runtime.create).toHaveBeenCalledWith("renderer-1", {
      providerConfigId: "provider-1",
      vaultId: "vault-1",
      targets: ["h1"],
      historySessionId: "history-1",
    });
  });
});
