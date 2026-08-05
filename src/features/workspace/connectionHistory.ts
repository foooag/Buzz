const STORAGE_KEY = "terminus.connectionHistory";
const CHANGE_EVENT = "terminus:connection-history-changed";
const MAX_ENTRIES = 200;

export type HistoryStatus = "success" | "connected" | "failed";

export type HistoryEntry = {
  id: string;
  sessionId: string | null;
  hostId: string;
  host: string;
  port: number;
  protocol: "ssh";
  username: string;
  startedAt: string;
  endedAt: string | null;
  status: HistoryStatus;
  reason?: string;
};

function validEntry(value: unknown): value is HistoryEntry {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "host" in value &&
    typeof value.host === "string" &&
    "startedAt" in value &&
    typeof value.startedAt === "string" &&
    "status" in value &&
    (value.status === "success" || value.status === "connected" || value.status === "failed"),
  );
}

export function listConnectionHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(validEntry).sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function recordConnectionAttempt(input: {
  hostId: string;
  host: string;
  port: number;
  username: string;
}): string {
  const id = crypto.randomUUID();
  write([
    {
      id,
      sessionId: null,
      hostId: input.hostId,
      host: input.host,
      port: input.port,
      protocol: "ssh",
      username: input.username,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "connected",
    },
    ...listConnectionHistory(),
  ]);
  return id;
}

export function markConnectionConnected(id: string, sessionId: string): void {
  write(
    listConnectionHistory().map((entry) =>
      entry.id === id ? { ...entry, sessionId, status: "connected", reason: undefined } : entry,
    ),
  );
}

export function markConnectionFailed(id: string, reason = "Connection failed"): void {
  write(
    listConnectionHistory().map((entry) =>
      entry.id === id
        ? { ...entry, endedAt: new Date().toISOString(), status: "failed", reason }
        : entry,
    ),
  );
}

export function finishConnectionSession(sessionId: string): void {
  write(
    listConnectionHistory().map((entry) =>
      entry.sessionId === sessionId && entry.status === "connected"
        ? { ...entry, endedAt: new Date().toISOString(), status: "success" }
        : entry,
    ),
  );
}

export function subscribeConnectionHistory(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function formatHistoryWhen(entry: HistoryEntry, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(entry.startedAt));
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} h ago`;
  return `${Math.floor(elapsed / 86_400_000)} d ago`;
}

export function formatHistoryDuration(entry: HistoryEntry, now = Date.now()): string {
  if (entry.status === "failed") return "—";
  const end = entry.endedAt ? Date.parse(entry.endedAt) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(entry.startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function connectionHistoryCsv(entries: HistoryEntry[]): string {
  const rows = [
    ["startedAt", "endedAt", "status", "protocol", "host", "port", "username", "reason"],
    ...entries.map((entry) => [
      entry.startedAt,
      entry.endedAt ?? "",
      entry.status,
      entry.protocol,
      entry.host,
      entry.port,
      entry.username,
      entry.reason ?? "",
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadConnectionHistory(entries: HistoryEntry[]): void {
  const url = URL.createObjectURL(new Blob([connectionHistoryCsv(entries)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `terminus-history-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
