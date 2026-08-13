export const AGENT_STREAM_CHANNEL = "agent:stream";

export type AgentStreamRequest = {
  agentId: string;
  text: string;
  targets: string[];
  vaultId?: string;
};

export type AgentStreamMessage =
  | {
      role: "user";
      content: string | Array<Record<string, unknown> & { type: string }>;
      timestamp: number;
    }
  | {
      role: "assistant";
      content: Array<Record<string, unknown> & { type: string }>;
      stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted";
      timestamp: number;
      errorMessage?: string;
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: Array<Record<string, unknown> & { type: string }>;
      isError: boolean;
      timestamp: number;
    };

export type AgentStreamSnapshot = {
  agentId: string;
  providerConfigId: string;
  status: "idle" | "running" | "waitingForConfirmation";
  hosts: string[];
  messages: AgentStreamMessage[];
  errorMessage?: string;
};

export type AgentStreamEvent =
  | { type: "agentStart" }
  | { type: "messageStart"; message: AgentStreamMessage }
  | { type: "messageUpdate"; message: AgentStreamMessage }
  | { type: "messageEnd"; message: AgentStreamMessage }
  | { type: "toolStart"; toolCallId: string; toolName: string; args: unknown }
  | { type: "toolUpdate"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "toolEnd"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | {
      type: "toolConfirmationRequired";
      confirmation: {
        confirmationId: string;
        level: "high";
        command: string;
        reason: string;
        projectedEffect: string;
      };
    }
  | { type: "agentEnd"; snapshot: AgentStreamSnapshot }
  | { type: "historySaveFailed" };
