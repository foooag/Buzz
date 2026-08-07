import { useState } from "react";
import { AlertTriangle, ChevronRight, Server } from "lucide-react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { AgentToolConfirmation } from "./agentTypes";

export function ConfirmCard({
  confirmation,
  onResolve,
}: {
  confirmation: AgentToolConfirmation;
  onResolve: (decision: "run" | "cancel", command?: string) => void;
}) {
  const [commandDraft, setCommandDraft] = useState(confirmation.command ?? "");
  const hostLabel = useInventoryStore(
    (state) =>
      (confirmation.hostId ? state.hosts[confirmation.hostId] : undefined)?.name ??
      confirmation.hostId ??
      "",
  );
  const edited = commandDraft.trim() !== (confirmation.command ?? "").trim();

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onResolve("cancel");
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onResolve("run", commandDraft.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={() => onResolve("cancel")}
    >
      <div
        className="pop-in w-[min(560px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">
                Confirm high-risk command
              </h2>
              <span className="rounded-full bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
                high
              </span>
            </div>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Server size={12} />
              On {hostLabel || "target host"} via headless SSH · the agent is asking
              permission to proceed.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              Command
            </label>
            <div className="flex items-start gap-2 rounded-md border border-smoke bg-black/50 px-2.5 py-2 font-mono text-[12.5px] text-mist focus-within:border-coral-red/50">
              <span className="select-none text-coral-red/80">$</span>
              <input
                autoFocus
                value={commandDraft}
                onChange={(event) => setCommandDraft(event.target.value)}
                onKeyDown={handleKey}
                spellCheck={false}
                aria-label="Command to confirm"
                className="min-w-0 flex-1 bg-transparent text-mist outline-none"
              />
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-fog/80">
              Editable — change it before approving if needed.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-coral-red">
              <AlertTriangle size={12} />
              Why this is risky
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">
              {confirmation.reason}
            </p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <ChevronRight size={12} />
              What will happen
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">
              {confirmation.projectedEffect}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onResolve("cancel")}
            className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px]">
                ⌘⏎
              </kbd>{" "}
              run ·{" "}
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px]">
                Esc
              </kbd>{" "}
              cancel
            </span>
            <button
              type="button"
              onClick={() => onResolve("run", commandDraft.trim())}
              className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              {edited ? "Run edited command" : "Run command"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
