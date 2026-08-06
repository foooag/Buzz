import { useEffect, useRef, useState } from "react";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import type { AgentSession } from "./sessionStore";
import { formatSessionTime } from "./sessionStore";

export type HistoryDropdownProps = {
  sessions: AgentSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function HistoryDropdown({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onClose,
}: HistoryDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (renamingId) setRenamingId(null);
      else onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose, renamingId]);

  const startRename = (session: AgentSession) => {
    setRenamingId(session.id);
    setDraft(session.title);
  };

  const commitRename = () => {
    if (renamingId && draft.trim()) onRename(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Chat history"
      className="pop-in absolute right-0 top-[calc(100%+6px)] z-40 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border border-graphite bg-carbon shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-graphite px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">
          <History size={11} className="text-acid-lime" />
          Chat history
        </div>
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onClose();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-graphite bg-obsidian/60 px-2 py-1 text-[11px] font-medium text-mist transition-colors hover:bg-graphite"
        >
          <Plus size={11} />
          New chat
        </button>
      </div>

      <div className="scroll-thin max-h-[320px] overflow-y-auto p-1.5">
        {sessions.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-[12px] text-fog">
            No past chats yet — start a new task and it will appear here.
          </p>
        ) : (
          sessions.map((session) => {
            const active = session.id === activeId;
            const renaming = renamingId === session.id;
            const msgCount = session.items?.length ?? 0;
            return (
              <div
                key={session.id}
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  if (renaming) return;
                  onSelect(session.id);
                  onClose();
                }}
                onKeyDown={(event) => {
                  if (renaming) return;
                  if (event.key === "Enter") {
                    onSelect(session.id);
                    onClose();
                  }
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  startRename(session);
                }}
                className={
                  "group/hist relative flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors " +
                  (active ? "bg-graphite" : "hover:bg-white/5")
                }
              >
                <span
                  className={
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " +
                    (session.phase === "streaming" ||
                      session.phase === "awaiting-confirm"
                      ? "bg-acid-lime"
                      : active
                        ? "bg-pulse-green"
                        : "bg-fog/40")
                  }
                />
                <span className="min-w-0 flex-1">
                  {renaming ? (
                    <input
                      autoFocus
                      value={draft}
                      aria-label="Session title"
                      onChange={(event) => setDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setRenamingId(null);
                        }
                      }}
                      onBlur={commitRename}
                      className="w-full rounded border border-smoke bg-black/40 px-1.5 py-0.5 text-[13px] text-paper outline-none focus:border-acid-lime/50"
                    />
                  ) : (
                    <span className="block truncate text-[13px] leading-snug text-paper">
                      {session.title}
                    </span>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fog">
                    <span>{msgCount} msg{msgCount === 1 ? "" : "s"}</span>
                    <span className="text-fog/50">·</span>
                    <span>{formatSessionTime(session.updatedAt)}</span>
                  </span>
                </span>
                {!renaming ? (
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/hist:opacity-100">
                    <button
                      type="button"
                      aria-label={`Rename ${session.title}`}
                      title="Rename"
                      onClick={(event) => {
                        event.stopPropagation();
                        startRename(session);
                      }}
                      className="grid h-6 w-6 place-items-center rounded text-fog transition-colors hover:bg-white/10 hover:text-mist"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${session.title}`}
                      title="Delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(session.id);
                      }}
                      className="grid h-6 w-6 place-items-center rounded text-fog transition-colors hover:bg-coral-red/15 hover:text-coral-red"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-graphite px-3 py-1.5 text-[10.5px] text-fog/60">
        Double-click to rename ·{" "}
        <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">
          Esc
        </kbd>{" "}
        to dismiss
      </div>
    </div>
  );
}
