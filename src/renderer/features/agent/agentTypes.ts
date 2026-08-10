// Local JSON value types, structurally identical to assistant-stream's
// ReadonlyJSONObject/ReadonlyJSONValue, so AgentToolCallPart.args remains
// assignable to ThreadMessageLike's tool-call variant (whose args field is
// typed as ReadonlyJSONObject) once the assistant-ui react import is dropped
// from this file.
type AgentJsonValue =
  | null
  | string
  | number
  | boolean
  | AgentJsonObject
  | readonly AgentJsonValue[];
type AgentJsonObject = { readonly [key: string]: AgentJsonValue };

export type AgentPartStatus =
  | { type: "running" }
  | { type: "complete" }
  | { type: "incomplete"; reason: "cancelled" | "length" | "content-filter" | "other" | "error" };

export type AgentMessageStatus =
  | { type: "running" }
  | { type: "requires-action"; reason: "tool-calls" | "interrupt" }
  | { type: "complete"; reason: "stop" | "unknown" }
  | { type: "incomplete"; reason: "cancelled" | "tool-calls" | "length" | "other" | "error"; error?: string };

export type AgentTextPart = { type: "text"; text: string; status?: AgentPartStatus };
export type AgentReasoningPart = { type: "reasoning"; text: string; status?: AgentPartStatus };
export type AgentToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: AgentJsonObject;
  argsText: string;
  result?: unknown;
  isError?: boolean;
  timing?: { startedAt: number; completedAt?: number };
  approval?: { id: string; approved?: boolean; reason?: string; isAutomatic?: boolean; resolution?: "cancelled" | "expired" };
};

export type AgentAssistantPart = AgentTextPart | AgentReasoningPart | AgentToolCallPart;
export type AgentUserPart = AgentTextPart;

export type AgentMessage =
  | { id: string; role: "user"; content: readonly AgentUserPart[] }
  | { id: string; role: "assistant"; content: readonly AgentAssistantPart[]; status: AgentMessageStatus };

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
