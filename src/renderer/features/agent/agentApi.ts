import { COMMANDS } from "@shared/ipc/command-names";
import { callCommand } from "@/app/ipc";
import type { AgentClient, AgentEvent, AgentSnapshot } from "./agentTypes";

export const agentApi: AgentClient = {
  create: (input) =>
    callCommand<typeof input, AgentSnapshot>(COMMANDS.agentCreate, input),
  streamPrompt: (agentId, text, targets, onEvent, vaultId, onClose) => {
    if (!window.terminus) {
      throw new Error("The Electron preload bridge is unavailable.");
    }
    return window.terminus.streamAgent(
      { agentId, text, targets, ...(vaultId ? { vaultId } : {}) },
      (event) => onEvent(event as AgentEvent),
      onClose,
    );
  },
  steer: (agentId, text) =>
    callCommand<{ agentId: string; text: string }, void>(
      COMMANDS.agentSteer,
      { agentId, text },
    ),
  abort: (agentId) =>
    callCommand<{ agentId: string }, void>(COMMANDS.agentAbort, { agentId }),
  decideTool: (agentId, confirmationId, approved) =>
    callCommand<{
      agentId: string;
      confirmationId: string;
      approved: boolean;
    }, void>(COMMANDS.agentDecideTool, { agentId, confirmationId, approved }),
  close: (agentId) =>
    callCommand<{ agentId: string }, void>(COMMANDS.agentClose, { agentId }),
};
