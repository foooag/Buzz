import { useEffect, useState } from "react";
import { Pencil, Server, Trash2 } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

export function QuickScriptEditDialog({
  qs,
  hostLabel,
  onSave,
  onDelete,
  onClose,
}: {
  qs: QuickScript;
  hostLabel: string;
  onSave: (draft: { title: string; script: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(qs.title);
  const [script, setScript] = useState(qs.script);
  const dirty = title.trim() !== qs.title || script !== qs.script;
  const canSave = dirty && title.trim().length > 0 && script.trim().length > 0;
  const pct = qs.sourceUsageCount ? Math.round((qs.sourceSuccessCount / qs.sourceUsageCount) * 100) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (canSave) onSave({ title, script });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, onClose, onSave, script, title]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="pop-in w-[min(520px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
            <Pencil size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">Edit quick script</h2>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Server size={12} />
              On {hostLabel} · Used {qs.sourceUsageCount} times · {pct === null ? "--" : `${pct}%`} success
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog" htmlFor="qs-title">Name</label>
            <input
              id="qs-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-graphite bg-black/30 px-2.5 py-2 text-[13px] text-mist outline-none transition-colors focus:border-smoke"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog" htmlFor="qs-script">Script</label>
            <textarea
              id="qs-script"
              value={script}
              onChange={(event) => setScript(event.target.value)}
              spellCheck={false}
              rows={6}
              className="scroll-thin w-full resize-none rounded-md border border-graphite bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist outline-none transition-colors focus:border-smoke"
            />
            <p className="m-0 mt-1.5 text-[11px] text-fog/80">
              Multi-line scripts are written to the terminal as one bracketed paste, never split by the shell.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onDelete(qs.id)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] text-coral-red transition-colors hover:bg-coral-red/12"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">⌘⏎</kbd> Save
            </span>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => canSave && onSave({ title, script })}
              disabled={!canSave}
              className={
                "rounded-md px-4 py-2 text-[13px] font-semibold tracking-tight transition-colors " +
                (canSave ? "bg-acid-lime text-void hover:brightness-105" : "cursor-default bg-graphite text-fog")
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
