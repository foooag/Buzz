import type { AiAgentMessage } from "@/features/ai/aiAgentTypes";

export type AgentMessage = AiAgentMessage;

export type AgentSnapshot = {
  agentId: string;
  providerConfigId: string;
  status: "idle" | "running" | "waitingForConfirmation";
  hosts: string[];
  messages: AgentMessage[];
  errorMessage?: string;
};

export type AgentToolConfirmation = {
  confirmationId: string;
  level: "high";
  reason: string;
  projectedEffect: string;
  hostId?: string;
  command?: string;
};

export type AgentEvent =
  | { type: "agentStart" }
  | { type: "messageStart"; message: AgentMessage }
  | { type: "messageUpdate"; message: AgentMessage }
  | { type: "messageEnd"; message: AgentMessage }
  | { type: "toolStart"; toolCallId: string; toolName: string; args: unknown }
  | { type: "toolUpdate"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "toolEnd"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "toolConfirmationRequired"; confirmation: AgentToolConfirmation }
  | { type: "agentEnd"; snapshot: AgentSnapshot }
  | { type: "historySaveFailed" };

export type AgentCreateInput = {
  providerConfigId: string;
  targets?: string[];
};

export type AgentClient = {
  create(input: AgentCreateInput): Promise<AgentSnapshot>;
  prompt(
    agentId: string,
    text: string,
    targets: string[],
    onEvent: (event: AgentEvent) => void,
  ): Promise<AgentSnapshot>;
  steer(agentId: string, text: string): Promise<void>;
  abort(agentId: string): Promise<void>;
  decideTool(
    agentId: string,
    confirmationId: string,
    approved: boolean,
    command?: string,
  ): Promise<void>;
  close(agentId: string): Promise<void>;
};

export type AgentMentionItem = {
  id: string;
  type: "host" | "group";
  label: string;
};

export type AgentMentionCategory = {
  id: "hosts" | "groups";
  label: string;
  items: AgentMentionItem[];
};
