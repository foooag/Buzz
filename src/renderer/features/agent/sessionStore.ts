import type { AgentMessage } from "./agentTypes";
import type { CommandStep, HostProgress } from "./progressTypes";

/**
 * Chat session snapshot — a complete, localStorage-persisted picture of an
 * agent conversation: message list, per-host progress rail, composer draft,
 * and lifecycle phase. Switching sessions restores the exact visual state
 * (including command-card expand state).
 */
export type AgentSessionPhase =
  | "idle"
  | "streaming"
  | "awaiting-confirm"
  | "done"
  | "aborted";

export type AgentSession = {
  id: string;
  title: string;
  input: string;
  messages: AgentMessage[];
  hosts: HostProgress[];
  phase: AgentSessionPhase;
  createdAt: string;
  updatedAt: string;
};

export const AGENT_SESSIONS_KEY = "buzz.agent.sessions.v1";
export const AGENT_ACTIVE_KEY = "buzz.agent.activeSessionId.v1";

export const DEFAULT_SESSION_TITLE = "New task";

export function loadSessionsFromDisk(): AgentSession[] {
  try {
    const raw = window.localStorage.getItem(AGENT_SESSIONS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (session): session is Record<string, unknown> =>
        Boolean(session) &&
        typeof session === "object" &&
        typeof (session as AgentSession).id === "string",
    ).map(normalizeStoredSession);
  } catch {
    return [];
  }
}

export function saveSessionsToDisk(sessions: AgentSession[]): void {
  try {
    window.localStorage.setItem(AGENT_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function loadActiveIdFromDisk(): string | null {
  try {
    return window.localStorage.getItem(AGENT_ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveActiveIdToDisk(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(AGENT_ACTIVE_KEY, id);
    else window.localStorage.removeItem(AGENT_ACTIVE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function summarizeTitle(text: string): string {
  const trimmed = (text || "").trim();
  if (!trimmed) return DEFAULT_SESSION_TITLE;
  const firstLine = trimmed.split("\n")[0];
  // Strip @-mention directives like :host[foo]{name=…} and :group[…]{…} so
  // the title reads naturally.
  const cleaned = firstLine
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "@$1")
    .replace(/:(?:host|group)\[([^\]]+)\]\{[^}]*\}/g, "@$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 56 ? `${cleaned.slice(0, 55).trimEnd()}…` : cleaned;
}

export function formatSessionTime(iso: string): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate();
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (sameDay) return time;
    if (isYesterday) return "Yesterday";
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(
      [],
      sameYear
        ? { month: "short", day: "numeric" }
        : { year: "numeric", month: "short", day: "numeric" },
    );
  } catch {
    return "";
  }
}

export function sortSessionsByRecent(sessions: AgentSession[]): AgentSession[] {
  return [...sessions].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  );
}

/**
 * When restoring a stored session, transient flags (streaming carets, in-flight
 * tool cards) are normalised to a stable end-state so a reloaded conversation
 * doesn't appear to be mid-flight.
 */
export function normalizeRestoredMessages(messages: AgentMessage[]): AgentMessage[] {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (message.role !== "assistant" || message.status?.type !== "running") {
      return message;
    }
    return {
      ...message,
      status: { type: "incomplete", reason: "cancelled" },
    };
  });
}

export function normalizeRestoredHosts(hosts: HostProgress[]): HostProgress[] {
  return (Array.isArray(hosts) ? hosts : []).map((host) => ({
    ...host,
    phase:
      host.phase === "working" || host.phase === "connecting"
        ? "aborted"
        : host.phase,
    commands: (host.commands || []).map((command) =>
      command.status === "running"
        ? ({
            ...command,
            status: "error",
            error: "Interrupted by reload.",
          } as CommandStep)
        : command,
    ),
  }));
}

export function normalizeRestoredPhase(
  phase: AgentSessionPhase | undefined,
): AgentSessionPhase {
  if (phase === "streaming" || phase === "awaiting-confirm") return "aborted";
  return phase ?? "idle";
}

function normalizeStoredSession(value: Record<string, unknown>): AgentSession {
  const legacyItems = Array.isArray(value.items) ? value.items : [];
  return {
    id: String(value.id),
    title: typeof value.title === "string" ? value.title : DEFAULT_SESSION_TITLE,
    input: typeof value.input === "string" ? value.input : "",
    messages: Array.isArray(value.messages)
      ? value.messages as AgentMessage[]
      : migrateLegacyItems(legacyItems),
    hosts: Array.isArray(value.hosts) ? value.hosts as HostProgress[] : [],
    phase: normalizeRestoredPhase(value.phase as AgentSessionPhase | undefined),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function migrateLegacyItems(items: unknown[]): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (const value of items) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : `legacy-${Date.now()}`;
    if (item.kind === "user" && typeof item.text === "string") {
      messages.push({
        id,
        role: "user",
        content: [{ type: "text", text: item.text }],
      });
      continue;
    }
    if (item.kind === "assistant") {
      const content: Extract<AgentMessage, { role: "assistant" }>["content"] = [
        ...(typeof item.thinking === "string" && item.thinking
          ? [{ type: "reasoning" as const, text: item.thinking }]
          : []),
        ...(typeof item.text === "string" && item.text
          ? [{ type: "text" as const, text: item.text }]
          : []),
      ];
      messages.push({
        id,
        role: "assistant",
        content,
        status: { type: "complete", reason: "stop" },
      });
    }
  }
  return messages;
}
