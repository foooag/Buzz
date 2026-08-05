import { callCommand, callFiniteStreamingCommand } from "@/app/ipc";
import type {
  AgentClient,
  AgentCreateInput,
  AgentEvent,
  AgentSnapshot,
} from "./agentTypes";

export const agentApi: AgentClient = {
  create: async (input: AgentCreateInput) => {
    const result = await callCommand<
      AgentCreateInput,
      { agentId: string; snapshot: AgentSnapshot }
    >("agent_create", input);
    return result.snapshot;
  },
  prompt: (agentId, text, targets, onEvent) =>
    callFiniteStreamingCommand<
      { agentId: string; text: string; targets: string[] },
      AgentEvent,
      AgentSnapshot
    >("agent_prompt", { agentId, text, targets }, onEvent),
  steer: (agentId, text) =>
    callCommand<{ agentId: string; text: string }, void>(
      "agent_steer",
      { agentId, text },
    ),
  abort: (agentId) =>
    callCommand<{ agentId: string }, void>("agent_abort", { agentId }),
  decideTool: (agentId, confirmationId, approved, command) =>
    callCommand<
      {
        agentId: string;
        confirmationId: string;
        approved: boolean;
        command?: string;
      },
      void
    >("agent_decide_tool", {
      agentId,
      confirmationId,
      approved,
      ...(command ? { command } : {}),
    }),
  close: (agentId) =>
    callCommand<{ agentId: string }, void>("agent_close", { agentId }),
};
