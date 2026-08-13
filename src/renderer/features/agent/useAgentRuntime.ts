import {
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
  useLocalRuntime,
} from "@assistant-ui/react";
import { useMemo, type RefObject } from "react";
import { resolveTargets } from "./directiveText";
import type { AgentClient, AgentEvent } from "./agentTypes";

type SideDispatch = (event: AgentEvent) => void;

export function useAgentRuntime(
  agentClient: AgentClient,
  agentIdRef: RefObject<string | null>,
  groupHostsRef: RefObject<Readonly<Record<string, readonly string[]>>>,
  vaultIdRef: RefObject<string | null>,
  sideDispatch: SideDispatch,
) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async *run({ messages, abortSignal }) {
      const agentId = agentIdRef.current;
      if (!agentId) throw new Error("The Agent is still initializing.");
      const text = latestUserText(messages);
      const targets = resolveTargets(text, groupHostsRef.current);
      const queue = eventQueue();
      let receivedAgentEnd = false;
      const stop = agentClient.streamPrompt(
        agentId,
        text,
        targets,
        (event) => {
          sideDispatch(event);
          queue.push(event);
          if (event.type === "agentEnd") {
            receivedAgentEnd = true;
            queue.end();
          }
        },
        vaultIdRef.current ?? undefined,
        () => queue.end(),
      );
      const abort = () => {
        stop();
        queue.end();
      };
      abortSignal.addEventListener("abort", abort, { once: true });
      let content: ThreadAssistantMessagePart[] = [];
      try {
        for await (const event of queue) {
          content = applyEventToSnapshot(content, event);
          yield {
            content,
            status: event.type === "agentEnd"
              ? { type: "complete", reason: "stop" as const }
              : { type: "running" as const },
          };
        }
        if (!receivedAgentEnd) {
          yield {
            content,
            status: abortSignal.aborted
              ? { type: "incomplete", reason: "cancelled" as const }
              : { type: "complete", reason: "unknown" as const },
          };
        }
      } finally {
        abortSignal.removeEventListener("abort", abort);
        stop();
      }
    },
  }), [agentClient, agentIdRef, groupHostsRef, sideDispatch, vaultIdRef]);
  return useLocalRuntime(adapter);
}

export function applyEventToSnapshot(
  current: readonly ThreadAssistantMessagePart[],
  event: AgentEvent,
): ThreadAssistantMessagePart[] {
  if (
    (event.type === "messageStart" ||
      event.type === "messageUpdate" ||
      event.type === "messageEnd") &&
    event.message.role === "assistant"
  ) {
    const toolParts = current.filter((part) => part.type === "tool-call");
    const reasoning = event.message.content
      .filter((part) => part.type === "thinking")
      .map((part) => part.thinking)
      .join("");
    const text = event.message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    return [
      ...growReasoningParts(current, reasoning),
      ...streamingTextPart(current, text),
      ...toolParts,
    ];
  }
  if (event.type === "toolStart") {
    const part: ThreadAssistantMessagePart = {
      type: "tool-call",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: jsonObject(event.args) as never,
      argsText: JSON.stringify(event.args ?? {}),
    };
    return replaceToolPart(current, event.toolCallId, part);
  }
  if (event.type === "toolUpdate") {
    return current.map((part) => part.type === "tool-call" &&
      part.toolCallId === event.toolCallId
      ? { ...part, result: event.partialResult }
      : part);
  }
  if (event.type === "toolEnd") {
    return current.map((part) => part.type === "tool-call" &&
      part.toolCallId === event.toolCallId
      ? { ...part, result: event.result, isError: event.isError }
      : part);
  }
  return [...current];
}

// Reasoning is rendered as plain text inside GroupedParts. Appending only the
// new suffix gives every stream update a new part identity, so assistant-ui
// mounts the update instead of leaving the first part snapshot on screen.
// Adjacent reasoning parts are coalesced by the thought group in MessageViews.
function growReasoningParts(
  current: readonly ThreadAssistantMessagePart[],
  nextText: string,
): ThreadAssistantMessagePart[] {
  const existing = current.filter(
    (part): part is Extract<
      ThreadAssistantMessagePart,
      { type: "reasoning" }
    > => part.type === "reasoning",
  );
  const currentText = existing.map((part) => part.text).join("");
  if (nextText === currentText) return [...existing];
  if (nextText.startsWith(currentText)) {
    const suffix = nextText.slice(currentText.length);
    return suffix
      ? [...existing, { type: "reasoning", text: suffix }]
      : [...existing];
  }
  return nextText ? [{ type: "reasoning", text: nextText }] : [];
}

// Streamdown parses each text part independently. Keep the answer as one
// growing part so markdown spans and code fences stay parseable across tokens.
function streamingTextPart(
  current: readonly ThreadAssistantMessagePart[],
  nextText: string,
): ThreadAssistantMessagePart[] {
  const existing = current.filter(
    (part): part is Extract<
      ThreadAssistantMessagePart,
      { type: "text" }
    > => part.type === "text",
  );
  const currentText = existing.map((part) => part.text).join("");
  if (nextText === currentText) return [...existing];
  return nextText ? [{ type: "text", text: nextText }] : [];
}

function latestUserText(messages: readonly ThreadMessage[]): string {
  const message = [...messages].reverse().find((candidate) => candidate.role === "user");
  if (!message || message.role !== "user") return "";
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function replaceToolPart(
  current: readonly ThreadAssistantMessagePart[],
  toolCallId: string,
  replacement: ThreadAssistantMessagePart,
): ThreadAssistantMessagePart[] {
  const index = current.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === toolCallId,
  );
  if (index < 0) return [...current, replacement];
  return current.map((part, partIndex) => partIndex === index ? replacement : part);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function eventQueue() {
  const events: AgentEvent[] = [];
  let closed = false;
  let wake: (() => void) | undefined;
  return {
    push(event: AgentEvent) {
      if (closed) return;
      events.push(event);
      wake?.();
      wake = undefined;
    },
    end() {
      closed = true;
      wake?.();
      wake = undefined;
    },
    async *[Symbol.asyncIterator]() {
      while (!closed || events.length > 0) {
        if (events.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        yield events.shift() as AgentEvent;
      }
    },
  };
}
