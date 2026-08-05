export type AgentTextContent = { type: "text"; text: string };
export type AgentThinkingContent = {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
};
export type AgentToolCallContent = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: unknown;
  thoughtSignature?: string;
};
export type AgentImageContent = { type: "image"; data: string; mimeType: string };

export type AgentMessageWire =
  | {
      role: "user";
      content: string | Array<AgentTextContent | AgentImageContent>;
      timestamp: number;
    }
  | {
      role: "assistant";
      content: Array<AgentTextContent | AgentThinkingContent | AgentToolCallContent>;
      stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted";
      timestamp: number;
      errorMessage?: string;
      [key: string]: unknown;
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: Array<AgentTextContent | AgentImageContent>;
      isError: boolean;
      timestamp: number;
    };

export type AgentSnapshotWire = {
  agentId: string;
  providerConfigId: string;
  status: "idle" | "running" | "waitingForConfirmation";
  hosts: string[];
  messages: AgentMessageWire[];
  errorMessage?: string;
};

export type AgentToolConfirmationWire = {
  confirmationId: string;
  level: "high";
  reason: string;
  projectedEffect: string;
  hostId?: string;
  command?: string;
};

export type AgentEventWire =
  | { type: "agentStart" }
  | { type: "messageStart"; message: AgentMessageWire }
  | { type: "messageUpdate"; message: AgentMessageWire }
  | { type: "messageEnd"; message: AgentMessageWire }
  | { type: "toolStart"; toolCallId: string; toolName: string; args: unknown }
  | { type: "toolUpdate"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "toolEnd"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "toolConfirmationRequired"; confirmation: AgentToolConfirmationWire }
  | { type: "agentEnd"; snapshot: AgentSnapshotWire }
  | { type: "historySaveFailed" };
