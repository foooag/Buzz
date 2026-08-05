import { callCommand, callFiniteStreamingCommand } from "@/app/ipc";
import type { AiAgentEvent, AiAgentSnapshot } from "./aiAgentTypes";

export type AiAgentClient = {
  create(input: { providerConfigId: string; sshSessionId: string }): Promise<AiAgentSnapshot>;
  prompt(agentId: string, text: string, onEvent: (event: AiAgentEvent) => void): Promise<AiAgentSnapshot>;
  steer(agentId: string, text: string): Promise<void>;
  abort(agentId: string): Promise<void>;
  decideTool(agentId: string, confirmationId: string, approved: boolean): Promise<void>;
  close(agentId: string): Promise<void>;
};

export const aiAgentApi: AiAgentClient = {
  create: async (input) => {
    const result = await callCommand<
      typeof input,
      { agentId: string; snapshot: AiAgentSnapshot }
    >("ai_agent_create", input);
    return result.snapshot;
  },
  prompt: (agentId, text, onEvent) =>
    callFiniteStreamingCommand<
      { agentId: string; text: string },
      AiAgentEvent,
      AiAgentSnapshot
    >("ai_agent_prompt", { agentId, text }, onEvent),
  steer: (agentId, text) =>
    callCommand<{ agentId: string; text: string }, void>("ai_agent_steer", { agentId, text }),
  abort: (agentId) =>
    callCommand<{ agentId: string }, void>("ai_agent_abort", { agentId }),
  decideTool: (agentId, confirmationId, approved) =>
    callCommand<{ agentId: string; confirmationId: string; approved: boolean }, void>(
      "ai_agent_decide_tool",
      { agentId, confirmationId, approved },
    ),
  close: (agentId) =>
    callCommand<{ agentId: string }, void>("ai_agent_close", { agentId }),
};
