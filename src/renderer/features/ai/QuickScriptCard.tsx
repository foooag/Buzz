import { Pencil, Pin, Play, TriangleAlert, X } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

function stats(qs: QuickScript): { pct: number | null } {
  if (!qs.sourceUsageCount) return { pct: null };
  return { pct: Math.round((qs.sourceSuccessCount / qs.sourceUsageCount) * 100) };
}

export function QuickScriptCard({
  qs,
  onExecute,
  onPin,
  onEdit,
  onDismiss,
}: {
  qs: QuickScript;
  onExecute: (qs: QuickScript) => void;
  onPin: (id: string) => void;
  onEdit: (qs: QuickScript) => void;
  onDismiss: (id: string) => void;
}) {
  const pinned = qs.status === "pinned";
  const { pct } = stats(qs);
  const lines = qs.script.split("\n");
  const first = lines[0];
  const extra = lines.length - 1;
  const stop = (fn: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    fn();
  };
  const actBtn =
    "grid h-[22px] w-[22px] place-items-center rounded-md text-fog transition-colors hover:bg-white/10 hover:text-mist";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Quick script ${qs.title}`}
      onClick={() => onExecute(qs)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExecute(qs);
        }
      }}
      className={
        "group relative min-w-0 cursor-pointer rounded-[10px] border bg-carbon/80 px-2.5 py-[7px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acid-lime " +
        (pinned
          ? "border-acid-lime/30 bg-acid-lime/[0.04] shadow-[inset_2px_0_0_rgba(228,242,34,0.55)]"
          : "border-graphite/60 hover:border-smoke")
      }
    >
      <div className="flex items-center gap-2">
        {qs.isNew ? (
          <span className="shrink-0 rounded bg-acid-lime/15 px-1 py-px text-[9.5px] font-semibold text-acid-lime">NEW</span>
        ) : null}
        {qs.mode === "rules" ? (
          <span className="shrink-0 rounded border border-smoke/60 bg-graphite/50 px-1 py-px text-[9.5px] text-fog">RULES</span>
        ) : null}
        <span className="max-w-[46%] shrink-0 truncate text-[12px] font-medium tracking-tight text-mist">{qs.title}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] leading-none text-fog">
          {qs.riskHint ? (
            <TriangleAlert aria-label="risk hint" size={10} className="mr-1 inline-block translate-y-[1px] text-yellow-400" />
          ) : null}
          {first}
          {extra > 0 ? <span className="text-fog/60"> ⏎+{extra}</span> : null}
        </span>

        <span className="relative h-[22px] shrink-0">
          <span className="flex h-full items-center gap-1 transition-opacity duration-150 group-hover:opacity-0">
            {pinned ? <Pin size={11} className="text-acid-lime" /> : null}
            {qs.executedCount > 0 ? (
              <span
                title={`Run from card ${qs.executedCount} times`}
                className="inline-flex items-center gap-0.5 rounded-pill bg-graphite/80 px-1.5 text-[10px] text-fog"
              >
                <Play size={8} />
                {qs.executedCount}
              </span>
            ) : null}
            {pct !== null ? (
              <span
                title={`Used ${qs.sourceUsageCount} times in session · ${pct}% success`}
                className="whitespace-nowrap rounded-pill bg-graphite/80 px-1.5 text-[10px] text-fog"
              >
                {qs.sourceUsageCount}x · {pct}%
              </span>
            ) : null}
          </span>
          <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button type="button" aria-label={`Run ${qs.title}`} title="Write to terminal and run" onClick={stop(() => onExecute(qs))} className={actBtn}>
              <Play size={12} />
            </button>
            <button
              type="button"
              aria-label={pinned ? `Unpin ${qs.title}` : `Pin ${qs.title}`}
              title={pinned ? "Unpin" : "Pin"}
              onClick={stop(() => onPin(qs.id))}
              className={actBtn + (pinned ? " text-acid-lime" : "")}
            >
              <Pin size={12} />
            </button>
            <button type="button" aria-label={`Edit ${qs.title}`} title="Edit" onClick={stop(() => onEdit(qs))} className={actBtn}>
              <Pencil size={12} />
            </button>
            <button
              type="button"
              aria-label={`Dismiss ${qs.title}`}
              title="Dismiss (never show again)"
              onClick={stop(() => onDismiss(qs.id))}
              className="grid h-[22px] w-[22px] place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
            >
              <X size={12} />
            </button>
          </span>
        </span>
      </div>

      <span className="pointer-events-none absolute left-2 right-2 top-full z-30 mt-1 hidden rounded-lg border border-graphite bg-carbon px-2.5 py-2 text-left shadow-[0_14px_44px_rgb(0_0_0/0.55)] group-hover:block">
        <span className="block text-[11px] font-medium text-mist">{qs.title}</span>
        {qs.description ? (
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-fog">{qs.description}</span>
        ) : null}
        {qs.riskHint ? (
          <span className="mt-1 flex items-center gap-1 text-[10.5px] text-yellow-400">
            <TriangleAlert size={10} />
            {qs.riskHint}
          </span>
        ) : null}
        <span className="mt-1.5 block whitespace-pre-wrap break-all rounded-md border border-graphite/70 bg-black/50 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-mist/90">
          {qs.script}
        </span>
        <span className="mt-1 block text-[10px] text-fog/70">
          Used {qs.sourceUsageCount} times in session · {pct === null ? "--" : `${pct}%`} success
          {qs.executedCount > 0 ? ` · run ${qs.executedCount} times` : ""}
          {qs.mode === "rules" ? " · rules mode" : ""}
        </span>
      </span>
    </div>
  );
}
