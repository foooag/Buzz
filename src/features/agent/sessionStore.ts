import type { AgentItem, ToolCardItem } from "./agentItems";
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
  items: AgentItem[];
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
      (session): session is AgentSession =>
        Boolean(session) &&
        typeof session === "object" &&
        typeof (session as AgentSession).id === "string",
    );
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
export function normalizeRestoredItems(items: AgentItem[]): AgentItem[] {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item.kind === "assistant" && item.streaming) {
      return { ...item, streaming: false };
    }
    if (
      item.kind === "tool" &&
      (item.status === "pending" || item.status === "running")
    ) {
      return { ...item, status: "aborted" } as ToolCardItem;
    }
    return item;
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
