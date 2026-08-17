import { Check, ChevronDown, RefreshCw, Sparkles, TriangleAlert, Terminal } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";
import { QuickScriptCard } from "./QuickScriptCard";

export type QuickScriptGenPhase = "idle" | "working" | "done" | "empty" | "failed";

export function QuickScriptsSection({
  hostName,
  visible,
  poolCount,
  phase,
  generatedCount,
  collapsed,
  onToggleCollapse,
  onShuffle,
  onExecute,
  onPin,
  onEdit,
  onDismiss,
}: {
  hostName: string;
  visible: QuickScript[];
  poolCount: number;
  phase: QuickScriptGenPhase;
  generatedCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onShuffle: () => void;
  onExecute: (qs: QuickScript) => void;
  onPin: (id: string) => void;
  onEdit: (qs: QuickScript) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <section aria-label="Quick scripts" className="shrink-0 px-3 pt-3">
      <div className="rounded-xl border border-graphite/70 bg-graphite/25">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <Sparkles size={13} className="shrink-0 text-acid-lime" />
          <span className="shrink-0 text-[12px] font-semibold tracking-tight text-mist">Quick scripts</span>
          <span className="min-w-0 truncate text-[11px] text-fog/80">{hostName}</span>
          {phase === "working" ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1.5 text-[11px] text-fog">
              <span className="h-3 w-3 shrink-0 animate-[terminus-spin_0.9s_linear_infinite] rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
              Recapping this session…
            </span>
          ) : null}
          {phase === "done" ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-pulse-green">
              <Check size={12} className="shrink-0" />
              {generatedCount > 0 ? `Generated ${generatedCount} scripts` : "Scripts are up to date"}
            </span>
          ) : null}
          {phase === "failed" ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-coral-red">
              <TriangleAlert size={12} className="shrink-0" />
              Generation failed — rules mode applied
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {poolCount > 3 && !collapsed ? (
              <button
                type="button"
                onClick={onShuffle}
                title="Shuffle"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
              >
                <RefreshCw size={11} />
                Shuffle
              </button>
            ) : null}
            {collapsed ? (
              <span className="mr-1 rounded-pill bg-graphite/80 px-1.5 py-0.5 text-[10px] text-fog">{poolCount} scripts</span>
            ) : null}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand quick scripts" : "Collapse quick scripts"}
              title={collapsed ? "Expand" : "Collapse"}
              className="grid h-6 w-6 place-items-center rounded text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <ChevronDown size={13} className={collapsed ? "" : "rotate-180"} />
            </button>
          </div>
        </div>

        {!collapsed ? (
          phase === "empty" ? (
            <div className="flex items-start gap-2 px-3 pb-3 pt-1 text-[11.5px] leading-relaxed text-fog">
              <Terminal size={13} className="mt-0.5 shrink-0 text-fog/70" />
              <p className="m-0">
                No commands in this session yet — let the AI run a few first, then type{" "}
                <span className="rounded border border-graphite bg-carbon px-1 py-px font-mono text-[10.5px] text-mist">
                  /生成快捷指令
                </span>
              </p>
            </div>
          ) : (
            <div className="grid gap-1 px-1.5 pb-1.5">
              {visible.map((qs) => (
                <QuickScriptCard key={qs.id} qs={qs} onExecute={onExecute} onPin={onPin} onEdit={onEdit} onDismiss={onDismiss} />
              ))}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
