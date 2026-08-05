import { describe, expect, it, vi } from "vitest";
import { createAiCommandHandlers } from "../../../../electron/domains/ai/commands";
import type { AiService } from "../../../../electron/domains/ai/service";

const AI_COMMANDS = [
  "ai_list_provider_configs", "ai_create_provider_config", "ai_update_provider_config",
  "ai_delete_provider_config", "ai_test_provider_config", "ai_probe_provider_config",
  "ai_agent_create", "ai_agent_prompt", "ai_agent_steer", "ai_agent_abort",
  "ai_agent_decide_tool", "ai_agent_close", "ai_list_sessions", "ai_load_session",
  "ai_rename_session", "ai_delete_session",
];

describe("Electron AI commands", () => {
  it("owns the complete Electron AI IPC surface", () => {
    const handlers = createAiCommandHandlers(service(), vi.fn());
    expect(Object.keys(handlers).sort()).toEqual([...AI_COMMANDS].sort());
  });

  it("routes agent and history operations and validates malformed input", async () => {
    const mockService = service();
    const emit = vi.fn();
    const handlers = createAiCommandHandlers(mockService, emit);
    const context = {
      ownerId: "renderer-1",
      streamId: "stream-1",
      fallback: vi.fn(async () => ({ ok: false as const, error: {
        code: "fallback", message: "fallback",
      } })),
    };

    await expect(handlers.ai_agent_create?.({
      providerConfigId: "provider-1",
      sshSessionId: "ssh-1",
    }, context)).resolves.toEqual({
      ok: true,
      data: {
        agentId: "agent-1",
        snapshot: { agentId: "agent-1" },
      },
    });
    expect(mockService.agents.create).toHaveBeenCalledWith(
      "renderer-1",
      "provider-1",
      "ssh-1",
    );

    await expect(handlers.ai_agent_prompt?.({
      agentId: "agent-1",
      text: "inspect",
    }, context)).resolves.toEqual({ ok: true, data: { agentId: "agent-1" } });
    expect(emit).toHaveBeenCalledWith("stream-1", { type: "agentStart" });

    await expect(handlers.ai_list_sessions?.(null, context)).resolves.toEqual({
      ok: true, data: [{ id: "history" }],
    });
    await expect(handlers.ai_load_session?.({ id: 5 }, context)).resolves.toMatchObject({
      ok: false, error: { code: "IPC_INVALID_INPUT" },
    });
    expect(context.fallback).not.toHaveBeenCalled();
  });
});

function service(): AiService {
  return {
    configs: {
      list: vi.fn(() => []), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
      setTesting: vi.fn(), getResolved: vi.fn(), saveTestResult: vi.fn(),
    },
    history: {
      save: vi.fn(), list: vi.fn(() => [{ id: "history" }]),
      load: vi.fn(), delete: vi.fn(),
    },
    models: { probe: vi.fn() },
    risk: {},
    agents: {
      create: vi.fn(() => ({ agentId: "agent-1" })),
      prompt: vi.fn(async (_ownerId, _agentId, _text, emit) => {
        emit({ type: "agentStart" });
        return { agentId: "agent-1" };
      }),
      steer: vi.fn(), abort: vi.fn(), decideTool: vi.fn(), close: vi.fn(),
    },
    close: vi.fn(),
  } as unknown as AiService;
}
