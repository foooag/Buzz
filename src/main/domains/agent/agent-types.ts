export type AgentTextPartWire = {
  type: "text";
  text: string;
  status?: AgentPartStatusWire;
};

export type AgentReasoningPartWire = {
  type: "reasoning";
  text: string;
  status?: AgentPartStatusWire;
};

export type AgentPartStatusWire =
  | { type: "running" }
  | { type: "complete" }
  | {
      type: "incomplete";
      reason: "cancelled" | "length" | "content-filter" | "other" | "error";
    };

export type AgentToolCallPartWire = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
  timing?: {
    startedAt: number;
    completedAt?: number;
  };
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
    isAutomatic?: boolean;
    resolution?: "cancelled" | "expired";
  };
};

export type AgentMessageStatusWire =
  | { type: "running" }
  | { type: "requires-action"; reason: "tool-calls" | "interrupt" }
  | { type: "complete"; reason: "stop" | "unknown" }
  | {
      type: "incomplete";
      reason: "cancelled" | "tool-calls" | "length" | "other" | "error";
      error?: string;
    };

export type AgentMessageWire =
  | {
      id: string;
      role: "user";
      content: AgentTextPartWire[];
    }
  | {
      id: string;
      role: "assistant";
      content: Array<
        AgentTextPartWire | AgentReasoningPartWire | AgentToolCallPartWire
      >;
      status: AgentMessageStatusWire;
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
