import { Check, ChevronDown, Loader2, Server, TriangleAlert } from "lucide-react";
import type { HostProgress } from "./agentItems";

export function ProgressPanel({ hosts }: { hosts: readonly HostProgress[] }) {
  return (
    <aside
      aria-label="Host progress"
      className="scroll-thin min-h-0 overflow-y-auto border-l border-graphite bg-carbon p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Server className="size-4 text-acid-lime" />
        <h2 className="m-0 text-[12px] font-semibold uppercase tracking-wider text-mist">
          Host progress
        </h2>
      </div>
      <div className="space-y-2">
        {hosts.map((host) => (
          <section key={host.hostId} className="rounded-xl border border-graphite bg-obsidian/55 p-3">
            <div className="flex items-center gap-2 text-[12px] text-mist">
              <PhaseIcon phase={host.phase} />
              <span className="truncate font-medium">{host.hostId}</span>
              <span className="ml-auto text-[10px] capitalize text-fog">
                {host.phase.replace("awaitingConfirmation", "approval")}
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {host.commands.map((command) => (
                <details key={command.toolCallId} className="group rounded-lg border border-graphite/70 bg-void/30 px-2.5 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[10.5px] text-fog">
                    <ChevronDown className="size-3 transition group-open:rotate-180" />
                    <span className="truncate">{command.command}</span>
                  </summary>
                  {command.output ? (
                    <pre className="scroll-thin mb-0 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-fog">
                      {command.output}
                    </pre>
                  ) : null}
                </details>
              ))}
            </div>
          </section>
        ))}
        {!hosts.length ? (
          <p className="m-0 rounded-xl border border-dashed border-graphite px-3 py-5 text-center text-[11px] text-fog">
            Mention a server or group to track execution here.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function PhaseIcon({ phase }: { phase: HostProgress["phase"] }) {
  if (phase === "running" || phase === "awaitingConfirmation") {
    return <Loader2 className="spin size-3.5 text-acid-lime" />;
  }
  if (phase === "error") return <TriangleAlert className="size-3.5 text-coral-red" />;
  if (phase === "success") return <Check className="size-3.5 text-pulse-green" />;
  return <span className="size-2 rounded-full bg-fog/40" />;
}
