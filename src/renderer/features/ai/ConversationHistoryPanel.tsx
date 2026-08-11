import { useCallback, useState } from "react";
import {
  Edit3,
  History,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { AiSessionSummary } from "./aiSessionApi";

type ConversationWithMeta = AiSessionSummary;

function formatHistoryWhen(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const hhmm = `${hh}:${mm}`;
  if (sameDay) return hhmm;
  if (isYesterday) return `Yesterday ${hhmm}`;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return `${mmdd} ${hhmm}`;
}

function statusOf(conv: ConversationWithMeta): {
  label: string;
  dot: string;
  textCls: string;
} {
  switch (conv.lastStatus) {
    case "done":
      return {
        label: "Done",
        dot: "bg-pulse-green",
        textCls: "text-pulse-green",
      };
    case "failed":
      return {
        label: "Failed",
        dot: "bg-coral-red",
        textCls: "text-coral-red",
      };
    case "aborted":
      return {
        label: "Aborted",
        dot: "bg-yellow-400",
        textCls: "text-yellow-400",
      };
    case "interrupted":
      return {
        label: "Interrupted",
        dot: "bg-yellow-400",
        textCls: "text-yellow-400",
      };
    default:
      return {
        label: "Done",
        dot: "bg-pulse-green",
        textCls: "text-pulse-green",
      };
  }
}

function AiHistoryRow({
  conv,
  active,
  onOpen,
  onDelete,
  onRename,
}: {
  conv: ConversationWithMeta;
  active: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const status = statusOf(conv);

  const commitRename = useCallback(() => {
    const t = draft.trim();
    if (t && t !== conv.title) onRename(conv.id, t);
    setEditing(false);
  }, [draft, conv.title, conv.id, onRename]);

  return (
    <div
      data-active={active || undefined}
      className={
        "group relative cursor-pointer rounded-lg border px-3 py-2.5 transition-colors " +
        (active
          ? "border-acid-lime/50 bg-graphite/50"
          : "border-graphite/70 bg-obsidian/30 hover:border-smoke hover:bg-obsidian/60")
      }
      onClick={() => {
        if (!editing) onOpen(conv.id);
      }}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(conv.title);
                  setEditing(false);
                }
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-smoke bg-carbon px-1.5 py-0.5 text-[12.5px] text-mist outline-hidden"
            />
          ) : (
            <div className="truncate text-[12.5px] font-medium leading-snug text-mist">
              {conv.title}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-fog">
            <span>{formatHistoryWhen(conv.updatedAt)}</span>
            <span className="text-fog/40">·</span>
            <span>{conv.messageCount} msg</span>
            <span className="text-fog/40">·</span>
            <span className={status.textCls}>{status.label}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label="Rename conversation"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(conv.title);
              setEditing(true);
            }}
            className="grid h-6 w-6 place-items-center rounded text-fog hover:bg-white/10 hover:text-mist"
          >
            <Edit3 size={12} />
          </button>
          <button
            type="button"
            aria-label="Delete conversation"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conv.id);
            }}
            className="grid h-6 w-6 place-items-center rounded text-fog hover:bg-coral-red/12 hover:text-coral-red"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export type ConversationHistoryPanelProps = {
  conversations: ConversationWithMeta[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNewChat: () => void;
  onClose: () => void;
};

export function ConversationHistoryPanel({
  conversations,
  activeId,
  onOpen,
  onDelete,
  onRename,
  onNewChat,
  onClose,
}: ConversationHistoryPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return c.title.toLowerCase().includes(q);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-carbon">
      <div className="flex shrink-0 items-center gap-2 border-b border-graphite px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-graphite bg-obsidian/60 px-2.5 py-1.5 transition-colors focus-within:border-smoke">
          <Search size={13} className="shrink-0 text-fog" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Search past chats"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-mist outline-hidden placeholder:text-fog/60"
          />
        </div>
        <button
          type="button"
          onClick={onNewChat}
          title="New chat"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-acid-lime px-2.5 text-[11.5px] font-semibold text-void transition hover:brightness-105"
        >
          <Plus size={13} />
          New
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-graphite bg-obsidian/60 text-fog">
              <History size={18} />
            </span>
            <h4 className="m-0 mt-3 text-[13px] font-medium text-mist">
              {conversations.length === 0 ? "No past chats" : "No matches"}
            </h4>
            <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-fog">
              {conversations.length === 0
                ? "Conversations on this host are saved automatically."
                : "Try a different search."}
            </p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            {filtered.map((c) => (
              <AiHistoryRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onOpen={onOpen}
                onDelete={onDelete}
                onRename={onRename}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
