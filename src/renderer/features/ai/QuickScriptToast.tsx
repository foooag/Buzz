import { Trash2, X } from "lucide-react";
import type { QuickScriptUndo } from "./useQuickScripts";

export function QuickScriptToast({ undo, onUndo }: { undo: QuickScriptUndo | null; onUndo: () => void }) {
  if (!undo) return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-center">
      <div className="pop-in pointer-events-auto relative flex w-full max-w-[340px] items-center gap-2.5 overflow-hidden rounded-lg border border-smoke bg-carbon/95 px-3 py-2.5 shadow-[0_14px_44px_rgb(0_0_0/0.55)] backdrop-blur">
        {undo.kind === "delete" ? <Trash2 size={13} className="shrink-0 text-fog" /> : <X size={13} className="shrink-0 text-fog" />}
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-mist">
          {undo.kind === "delete" ? "Deleted" : "Dismissed"} “{undo.qs.title}”
          {undo.kind === "dismiss" ? " — it won’t appear again" : ""}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-md border border-graphite px-2 py-1 text-[11px] text-mist transition-colors hover:border-smoke"
        >
          Undo
        </button>
        <span className="qs-toast-bar absolute bottom-0 left-0 h-[2px] bg-acid-lime/70" />
      </div>
    </div>
  );
}
