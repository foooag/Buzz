import type { ThreadAssistantMessagePart } from "@assistant-ui/react";

// A single Agent turn can contain several assistant messages around tool calls.
// Keep all thought activity together and present the user-facing response after it.
export function groupThoughtParts(
  parts: readonly ThreadAssistantMessagePart[],
): ThreadAssistantMessagePart[] {
  const thought = parts.filter(
    (part) => part.type === "reasoning" || part.type === "tool-call",
  );
  const response = parts.filter(
    (part) => part.type !== "reasoning" && part.type !== "tool-call",
  );
  return [...thought, ...response];
}
