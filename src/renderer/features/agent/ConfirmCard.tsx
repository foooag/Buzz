import { ChevronRight, Server, ShieldAlert } from "lucide-react";
import type { AgentToolConfirmation } from "./agentTypes";

export function ConfirmCard({
  confirmation,
  onDecide,
}: {
  confirmation: AgentToolConfirmation;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="agent-confirm-title"
      onMouseDown={(event) => event.stopPropagation()}
      className="pop-in w-[min(560px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
    >
      <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
          <ShieldAlert className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id="agent-confirm-title" className="m-0 text-[15px] font-semibold tracking-tight text-paper">
              Confirm high-risk command
            </h2>
            <span className="rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
              high
            </span>
          </div>
          <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
            <Server className="size-3" />
            Headless SSH · the agent is asking permission to proceed.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-coral-red">
            <ShieldAlert className="size-3" />
            Why this is risky
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-mist">{confirmation.reason}</p>
        </section>
        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
            <ChevronRight className="size-3" />
            What will happen
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-mist">{confirmation.projectedEffect}</p>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
        <button
          type="button"
          onClick={() => onDecide(false)}
          className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onDecide(true)}
          className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
        >
          Run command
        </button>
      </div>
    </div>
  );
}
