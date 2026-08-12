import type {
  AiAgentMessage,
  AiToolConfirmation,
} from "../ai/agent-types.js";

export type AgentSnapshot = {
  agentId: string;
  providerConfigId: string;
  status: "idle" | "running" | "waitingForConfirmation";
  hosts: string[];
  messages: AiAgentMessage[];
  errorMessage?: string;
};

export type AgentEvent =
  | { type: "agentStart" }
  | { type: "messageStart"; message: AiAgentMessage }
  | { type: "messageUpdate"; message: AiAgentMessage }
  | { type: "messageEnd"; message: AiAgentMessage }
  | { type: "toolStart"; toolCallId: string; toolName: string; args: unknown }
  | { type: "toolUpdate"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "toolEnd"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "toolConfirmationRequired"; confirmation: AiToolConfirmation }
  | { type: "agentEnd"; snapshot: AgentSnapshot }
  | { type: "historySaveFailed" };

export type AgentCreateInput = {
  providerConfigId: string;
  vaultId?: string;
  targets?: string[];
  historySessionId?: string;
};
