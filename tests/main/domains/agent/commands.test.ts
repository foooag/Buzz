import { describe, expect, it, vi } from "vitest";
import { isCommandName } from "../../../../src/main/command-names.js";
import { createAgentCommandHandlers } from "../../../../src/main/domains/agent/commands.js";
import type { MultiHostAgentRuntime } from "../../../../src/main/domains/agent/agent-runtime.js";

const AGENT_COMMANDS = [
  "agent_create",
  "agent_prompt",
  "agent_steer",
  "agent_abort",
  "agent_decide_tool",
  "agent_close",
];

describe("Electron agent commands", () => {
  it("registers every agent command in the allowlist", () => {
    for (const name of AGENT_COMMANDS) expect(isCommandName(name)).toBe(true);
  });

  it("routes create, prompt, and decision operations with validation", async () => {
    const runtime = {
      create: vi.fn(() => ({ agentId: "a1", snapshot: { agentId: "a1" } })),
      prompt: vi.fn(async () => ({ agentId: "a1" })),
      steer: vi.fn(),
      abort: vi.fn(),
      decideTool: vi.fn(),
      close: vi.fn(async () => undefined),
    } as unknown as MultiHostAgentRuntime;
    const emit = vi.fn();
    const handlers = createAgentCommandHandlers(runtime, emit);
    const context = {
      ownerId: "o1",
      streamId: "s1",
      fallback: vi.fn(async () => ({ ok: false as const, error: {
        code: "fallback", message: "fallback",
      } })),
    };

    await expect(handlers.agent_create?.({
      providerConfigId: "cfg-1",
      targets: ["h1"],
    }, context)).resolves.toEqual({
      ok: true,
      data: { agentId: "a1", snapshot: { agentId: "a1" } },
    });
    expect(runtime.create).toHaveBeenCalledWith("o1", {
      providerConfigId: "cfg-1",
      targets: ["h1"],
    });

    await expect(handlers.agent_prompt?.({
      agentId: "a1",
      text: "uptime",
      targets: ["h1"],
    }, context)).resolves.toMatchObject({ ok: true });
    expect(runtime.prompt).toHaveBeenCalledWith(
      "o1",
      "a1",
      "uptime",
      { targets: ["h1"] },
      expect.any(Function),
    );

    await expect(handlers.agent_decide_tool?.({
      agentId: "a1",
      confirmationId: "c1",
      approved: true,
      command: "uptime -n 1",
    }, context)).resolves.toMatchObject({ ok: true });
    expect(runtime.decideTool).toHaveBeenCalledWith(
      "o1",
      "a1",
      "c1",
      true,
      "uptime -n 1",
    );

    await expect(handlers.agent_prompt?.({ agentId: "a1" }, context)).resolves
      .toMatchObject({ ok: false, error: { code: "IPC_INVALID_INPUT" } });
  });
});
