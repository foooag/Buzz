import { ShieldAlert } from "lucide-react";
import type { AgentToolConfirmation } from "./agentTypes";

export function ConfirmCard({
  confirmation,
  onDecide,
}: {
  confirmation: AgentToolConfirmation;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div role="alert" className="rounded-xl border border-coral-red/35 bg-coral-red/8 p-3.5">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-coral-red" />
        <div className="min-w-0">
          <p className="m-0 text-[12px] font-semibold text-paper">Confirmation required</p>
          <p className="mb-0 mt-1 text-[11px] leading-relaxed text-mist">{confirmation.reason}</p>
          {confirmation.projectedEffect ? (
            <p className="mb-0 mt-1 text-[10.5px] text-fog">{confirmation.projectedEffect}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => onDecide(false)} className="rounded-md border border-graphite px-3 py-1.5 text-[11px] text-mist hover:bg-graphite">
          Deny
        </button>
        <button type="button" onClick={() => onDecide(true)} className="rounded-md bg-coral-red px-3 py-1.5 text-[11px] font-semibold text-paper hover:bg-coral-red/85">
          Approve once
        </button>
      </div>
    </div>
  );
}
