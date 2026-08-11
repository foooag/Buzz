import { Check, Play, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { AiSessionSummary } from "@/features/ai/aiSessionApi";

export function HistoryDropdown({
  sessions,
  onLoad,
  onDelete,
  onRename,
}: {
  sessions: readonly AiSessionSummary[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId),
    [selectedId, sessions],
  );
  const [draftTitle, setDraftTitle] = useState("");

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Agent history"
        value={selectedId}
        onChange={(event) => {
          const id = event.target.value;
          setSelectedId(id);
          setDraftTitle(sessions.find((session) => session.id === id)?.title ?? "");
        }}
        className="max-w-44 rounded-md border border-graphite bg-obsidian px-2.5 py-1.5 text-[11px] text-mist outline-hidden"
      >
        <option value="">History</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>{session.title}</option>
        ))}
      </select>
      {selected ? (
        <>
          <button
            type="button"
            aria-label="Load Agent history"
            onClick={() => onLoad(selected.id)}
            className="grid size-7 place-items-center rounded-md text-fog hover:bg-graphite hover:text-paper"
          >
            <Play className="size-3.5" />
          </button>
          <input
            aria-label="Rename Agent history"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="w-32 rounded-md border border-graphite bg-obsidian px-2 py-1.5 text-[11px] text-mist outline-hidden"
          />
          <button
            type="button"
            aria-label="Save Agent history name"
            disabled={!draftTitle.trim() || draftTitle.trim() === selected.title}
            onClick={() => onRename(selected.id, draftTitle.trim())}
            className="grid size-7 place-items-center rounded-md text-fog hover:bg-graphite hover:text-paper disabled:opacity-40"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete Agent history"
            onClick={() => {
              onDelete(selected.id);
              setSelectedId("");
              setDraftTitle("");
            }}
            className="grid size-7 place-items-center rounded-md text-fog hover:bg-coral-red/15 hover:text-coral-red"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );
}
