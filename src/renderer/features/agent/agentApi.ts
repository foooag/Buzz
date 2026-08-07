import { COMMANDS } from "@shared/ipc/command-names";
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
    >(COMMANDS.agentCreate, input);
    return result.snapshot;
  },
  prompt: (agentId, text, targets, onEvent) =>
    callFiniteStreamingCommand<
      { agentId: string; text: string; targets: string[] },
      AgentEvent,
      AgentSnapshot
    >(COMMANDS.agentPrompt, { agentId, text, targets }, onEvent),
  steer: (agentId, text) =>
    callCommand<{ agentId: string; text: string }, void>(
      COMMANDS.agentSteer,
      { agentId, text },
    ),
  abort: (agentId) =>
    callCommand<{ agentId: string }, void>(COMMANDS.agentAbort, { agentId }),
  decideTool: (agentId, confirmationId, approved, command) =>
    callCommand<
      {
        agentId: string;
        confirmationId: string;
        approved: boolean;
        command?: string;
      },
      void
    >(COMMANDS.agentDecideTool, {
      agentId,
      confirmationId,
      approved,
      ...(command ? { command } : {}),
    }),
  close: (agentId) =>
    callCommand<{ agentId: string }, void>(COMMANDS.agentClose, { agentId }),
};
