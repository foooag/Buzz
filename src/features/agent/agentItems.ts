export type ToolStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "credential-missing"
  | "declined"
  | "aborted";

export type ToolCardItem = {
  id: string;
  kind: "tool";
  toolCallId: string;
  cmd: string;
  hostId: string;
  hostLabel: string;
  verdict: { allow: boolean };
  status: ToolStatus;
  exitCode?: number | null;
  durationMs?: number;
  output?: string;
  startedAt?: number;
  expanded: boolean;
  errorMessage?: string;
};

export type MessageItem = {
  id: string;
  kind: "user" | "assistant";
  text: string;
  thinking?: string;
  streaming?: boolean;
};

export type AgentItem = MessageItem | ToolCardItem;

let itemSeq = 0;

export function nextId(prefix: string): string {
  itemSeq += 1;
  return `${prefix}-${Date.now()}-${itemSeq}`;
}
