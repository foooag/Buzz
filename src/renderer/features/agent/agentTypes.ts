import type { AgentStreamEvent } from "@shared/agent-stream";
import type {
  AiAgentMessage,
  AiToolConfirmation,
} from "@/features/ai/aiAgentTypes";

export type AgentSnapshot = {
  agentId: string;
  providerConfigId: string;
  status: "idle" | "running" | "waitingForConfirmation";
  hosts: string[];
  messages: AiAgentMessage[];
  errorMessage?: string;
};

export type AgentEvent = AgentStreamEvent;
export type AgentToolConfirmation = AiToolConfirmation;

export type AgentClient = {
  create(input: {
    providerConfigId: string;
    vaultId?: string;
    targets?: string[];
    historySessionId?: string;
  }): Promise<AgentSnapshot>;
  streamPrompt(
    agentId: string,
    text: string,
    targets: string[],
    onEvent: (event: AgentEvent) => void,
    vaultId?: string,
    onClose?: () => void,
  ): () => void;
  steer(agentId: string, text: string): Promise<void>;
  abort(agentId: string): Promise<void>;
  decideTool(
    agentId: string,
    confirmationId: string,
    approved: boolean,
  ): Promise<void>;
  close(agentId: string): Promise<void>;
};
