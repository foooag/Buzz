import type { UIMessage } from "@ai-sdk/react";
import type {
  AgentAssistantPart,
  AgentMessage,
  AgentToolCallPart,
} from "@/features/agent/agentTypes";

/**
 * Append-only suffix diff. Returns the trailing slice of `next` that extends
 * `previous`, or undefined when there is nothing new to emit.
 *
 * The backend stream is append-only; if `next` is not a forward extension of
 * `previous` we defensively return undefined rather than emitting a delta.
 */
export function suffixDelta(previous: string, next: string): string | undefined {
  if (next === previous) return undefined;
  if (previous === "") return next;
  if (next.startsWith(previous)) return next.slice(previous.length);
  // Backend is append-only; a non-prefix change is unexpected. Skip defensively.
  return undefined;
}

type AnyPart = UIMessage["parts"][number];

function wirePartToUi(part: AgentAssistantPart): AnyPart {
  if (part.type === "text") {
    return { type: "text", text: part.text, state: "done" } as AnyPart;
  }
  if (part.type === "reasoning") {
    return { type: "reasoning", text: part.text, state: "done" } as AnyPart;
  }
  // Tool call part. v7 ToolUIPart state union:
  //   input-available | input-streaming | output-available | output-error | ...
  // v7 `output-error` carries `errorText` and types `output` as `never`, so the
  // error and success branches are distinct shapes (we cannot attach `output`
  // alongside `errorText`).
  if (part.isError) {
    return {
      type: `tool-${part.toolName}` as AnyPart["type"],
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.args,
      state: "output-error",
      errorText: errorMessage(part.result) ?? String(part.result ?? "Tool error"),
    } as AnyPart;
  }
  const hasResult = part.result !== undefined;
  if (!hasResult) {
    return {
      type: `tool-${part.toolName}` as AnyPart["type"],
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.args,
      state: "input-available",
    } as AnyPart;
  }
  return {
    type: `tool-${part.toolName}` as AnyPart["type"],
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: part.args,
    state: "output-available",
    output: {
      result: part.result,
      isError: false,
      timing: part.timing,
      approval: part.approval,
    },
  } as AnyPart;
}

// v7 tool UI parts use a discriminated union on `state`. We cast to a structural
// view so we can read input/output/errorText across the variants without tripping
// the union narrowing (the fields exist at runtime regardless of the variant).
type ToolPartLike = AnyPart & {
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  state?: string;
  output?: {
    result?: unknown;
    isError?: boolean;
    timing?: AgentToolCallPart["timing"];
    approval?: AgentToolCallPart["approval"];
  };
  errorText?: string;
};

function uiPartToWire(part: AnyPart): AgentAssistantPart {
  if (part.type === "text") return { type: "text", text: (part as { text: string }).text };
  if (part.type === "reasoning") return { type: "reasoning", text: (part as { text: string }).text };
  const tp = part as ToolPartLike;
  const input = (tp.input ?? {}) as AgentToolCallPart["args"];
  const state = tp.state;
  if (state === "output-error") {
    return {
      type: "tool-call",
      toolCallId: tp.toolCallId ?? "",
      toolName: tp.toolName ?? "",
      args: input,
      argsText: JSON.stringify(input),
      isError: true,
    };
  }
  const hasOutput = state === "output-available" && tp.output !== undefined;
  return {
    type: "tool-call",
    toolCallId: tp.toolCallId ?? "",
    toolName: tp.toolName ?? "",
    args: input,
    argsText: JSON.stringify(input),
    ...(hasOutput && tp.output
      ? {
          result: tp.output.result,
          isError: Boolean(tp.output.isError),
          timing: tp.output.timing,
          approval: tp.output.approval,
        }
      : {}),
  };
}

export function wireMessageToUi(message: AgentMessage): UIMessage {
  if (message.role === "user") {
    return {
      id: message.id,
      role: "user",
      parts: message.content.map((p) => ({ type: "text", text: p.text })) as UIMessage["parts"],
    } satisfies UIMessage;
  }
  return {
    id: message.id,
    role: "assistant",
    parts: message.content.map(wirePartToUi),
  } satisfies UIMessage;
}

export function uiMessageToWire(message: UIMessage): AgentMessage {
  if (message.role === "user") {
    const text = message.parts
      .filter((p): p is Extract<AnyPart, { type: "text" }> => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("");
    return { id: message.id, role: "user", content: [{ type: "text", text }] };
  }
  const parts = message.parts
    .filter((p) => p.type === "text" || p.type === "reasoning" || p.type.startsWith("tool-"))
    .map(uiPartToWire);
  const hasRunning = parts.some((p) => p.type === "tool-call" && p.result === undefined);
  return {
    id: message.id,
    role: "assistant",
    content: parts,
    status: hasRunning ? { type: "running" } : { type: "complete", reason: "stop" },
  };
}

export function mergeAuthoritative(
  messages: UIMessage[],
  snapshotAssistant: AgentMessage[],
): UIMessage[] {
  const byId = new Map(snapshotAssistant.map((m) => [m.id, wireMessageToUi(m)]));
  if (byId.size === 0) return messages;
  return messages.map((m) => (m.role === "assistant" && byId.has(m.id) ? byId.get(m.id)! : m));
}

function errorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}
