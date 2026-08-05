export type AiTextContent = { type: "text"; text: string };
export type AiThinkingContent = { type: "thinking"; thinking: string; thinkingSignature?: string };
export type AiToolCallContent = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: unknown;
  thoughtSignature?: string;
};
export type AiImageContent = { type: "image"; data: string; mimeType: string };

export type AiAgentMessage =
  | { role: "user"; content: string | Array<AiTextContent | AiImageContent>; timestamp: number }
  | {
      role: "assistant";
      content: Array<AiTextContent | AiThinkingContent | AiToolCallContent>;
      stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted";
      timestamp: number;
      errorMessage?: string;
      [key: string]: unknown;
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: Array<AiTextContent | AiImageContent>;
      isError: boolean;
      timestamp: number;
    };

export type AiAgentSnapshot = {
  agentId: string;
  providerConfigId: string;
  sshSessionId: string;
  status: "idle" | "running" | "waitingForConfirmation";
  messages: AiAgentMessage[];
  errorMessage?: string;
};

export type AiToolConfirmation = {
  confirmationId: string;
  level: "high";
  reason: string;
  projectedEffect: string;
};

export type AiAgentEvent =
  | { type: "agentStart" }
  | { type: "messageStart"; message: AiAgentMessage }
  | { type: "messageUpdate"; message: AiAgentMessage }
  | { type: "messageEnd"; message: AiAgentMessage }
  | { type: "toolStart"; toolCallId: string; toolName: string; args: unknown }
  | { type: "toolUpdate"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "toolEnd"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "toolConfirmationRequired"; confirmation: AiToolConfirmation }
  | { type: "agentEnd"; snapshot: AiAgentSnapshot }
  | { type: "historySaveFailed" };
