import { Check, History, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AiSessionSummary } from "@/features/ai/aiSessionApi";

export function HistoryDropdown({
  sessions,
  activeId,
  onLoad,
  onNew,
  onDelete,
  onRename,
}: {
  sessions: readonly AiSessionSummary[];
  activeId: string | null;
  onLoad: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const skipBlurCommit = useRef(false);
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions],
  );

  const startRename = (session: AiSessionSummary) => {
    skipBlurCommit.current = false;
    setRenamingId(session.id);
    setDraftTitle(session.title);
  };
  const commitRename = () => {
    if (renamingId && draftTitle.trim()) onRename(renamingId, draftTitle.trim());
    skipBlurCommit.current = true;
    setRenamingId(null);
    setDraftTitle("");
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) setRenamingId(null);
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Chat history"
          title="Chat history"
          className="size-7 text-fog hover:bg-white/5 hover:text-mist data-[state=open]:bg-graphite data-[state=open]:text-mist"
        >
          <History className="size-[15px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        aria-label="Chat history"
        className="w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl border-graphite bg-carbon p-0 text-mist shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-graphite px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">
            <History className="size-[11px] text-acid-lime" />
            Chat history
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="h-6 gap-1 border-graphite bg-obsidian/60 px-2 text-[11px] text-mist shadow-none hover:bg-graphite hover:text-paper"
          >
            <Plus className="size-[11px]" />
            New chat
          </Button>
        </div>

        <div className="scroll-thin max-h-[320px] overflow-y-auto p-1.5">
          {sortedSessions.length === 0 ? (
            <p className="m-0 px-2.5 py-6 text-center text-[12px] text-fog">
              No past chats yet — start a new task and it will appear here.
            </p>
          ) : sortedSessions.map((session) => {
            const active = session.id === activeId;
            const renaming = session.id === renamingId;
            return (
              <div
                key={session.id}
                role="menuitem"
                tabIndex={renaming ? -1 : 0}
                onClick={() => {
                  if (renaming) return;
                  onLoad(session.id);
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  if (renaming || event.key !== "Enter") return;
                  onLoad(session.id);
                  setOpen(false);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  startRename(session);
                }}
                className={`group/history relative flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active ? "bg-graphite" : "hover:bg-white/5"
                }`}
              >
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  session.lastStatus === "running"
                    ? "bg-acid-lime"
                    : active
                      ? "bg-pulse-green"
                      : "bg-fog/40"
                }`} />
                <span className="min-w-0 flex-1">
                  {renaming ? (
                    <input
                      autoFocus
                      aria-label="Rename Agent history"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          skipBlurCommit.current = true;
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => {
                        if (skipBlurCommit.current) {
                          skipBlurCommit.current = false;
                          return;
                        }
                        commitRename();
                      }}
                      className="w-full rounded border border-smoke bg-black/40 px-1.5 py-0.5 text-[13px] text-paper outline-none focus:border-acid-lime/50"
                    />
                  ) : (
                    <span className="block truncate text-[13px] leading-snug text-paper">
                      {session.title}
                    </span>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fog">
                    <span>{session.messageCount} msg{session.messageCount === 1 ? "" : "s"}</span>
                    <span className="text-fog/50">·</span>
                    <span>{formatSessionTime(session.updatedAt)}</span>
                  </span>
                </span>
                {renaming ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Save Agent history name"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        commitRename();
                      }}
                      className="size-6 text-fog hover:bg-white/10 hover:text-acid-lime"
                    >
                      <Check className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Cancel Agent history rename"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        skipBlurCommit.current = true;
                        setRenamingId(null);
                      }}
                      className="size-6 text-fog hover:bg-white/10 hover:text-mist"
                    >
                      <X className="size-3" />
                    </Button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/history:opacity-100 group-focus/history:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${session.title}`}
                      title="Rename"
                      onClick={(event) => {
                        event.stopPropagation();
                        startRename(session);
                      }}
                      className="size-6 text-fog hover:bg-white/10 hover:text-mist"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${session.title}`}
                      title="Delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(session.id);
                      }}
                      className="size-6 text-fog hover:bg-coral-red/15 hover:text-coral-red"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-graphite px-3 py-1.5 text-[10.5px] text-fog/60">
          Double-click to rename · <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">Esc</kbd> to dismiss
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], date.getFullYear() === now.getFullYear()
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" });
}
