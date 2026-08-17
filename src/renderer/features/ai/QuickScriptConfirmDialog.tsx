import { useEffect } from "react";
import { Server, Terminal, TriangleAlert } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

export function QuickScriptConfirmDialog({
  qs,
  hostLabel,
  reason,
  onResolve,
}: {
  qs: QuickScript;
  hostLabel: string;
  reason?: string;
  onResolve: (decision: "run" | "cancel") => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve("cancel");
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onResolve("run");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm quick script execution"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={() => onResolve("cancel")}
    >
      <div
        className="pop-in w-[min(560px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
            <TriangleAlert size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">Run quick script</h2>
              <span className="rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
                high
              </span>
            </div>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Server size={12} />
              On {hostLabel} · from “{qs.title}” — approved scripts are written to this terminal.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Terminal size={12} />
              Script
            </div>
            <pre className="scroll-thin m-0 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md border border-smoke bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist">
              {qs.script}
            </pre>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-yellow-400">
              <TriangleAlert size={12} />
              Risk
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">
              {qs.riskHint ?? reason ?? "This script contains privileged or destructive operations."}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button type="button" onClick={() => onResolve("cancel")} className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">⌘⏎</kbd> Run ·{" "}
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">Esc</kbd> Cancel
            </span>
            <button
              type="button"
              autoFocus
              onClick={() => onResolve("run")}
              className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              Execute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
