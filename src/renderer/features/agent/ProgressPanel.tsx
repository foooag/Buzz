import { Check, ChevronRight, Server, SlidersHorizontal, X } from "lucide-react";
import type { HostProgress } from "./progressTypes";

export function ProgressPanel({
  progress,
  onConnectFromServers,
}: {
  progress: HostProgress[];
  onConnectFromServers?: () => void;
}) {
  if (progress.length === 0) return null;
  const doneCount = progress.filter((host) => host.phase === "done").length;
  const hasError = progress.some((host) => host.phase === "error");
  return (
    <aside
      data-screen-label="Agent progress rail"
      className="flex w-[292px] shrink-0 flex-col border-l border-graphite bg-obsidian/30"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-graphite px-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">
          <SlidersHorizontal size={12} />
          Progress
        </div>
        <span className="rounded-full bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog">
          {doneCount}/{progress.length} done
        </span>
      </div>
      <div className="scroll-thin grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-2.5">
        {progress.map((host) => (
          <HostProgressCard key={host.hostId} host={host} />
        ))}
      </div>
      {hasError ? (
        <div className="shrink-0 border-t border-graphite px-3.5 py-2.5">
          <button
            type="button"
            onClick={onConnectFromServers}
            className="w-full rounded-md border border-graphite px-2.5 py-1.5 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Connect hosts from Servers
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function HostProgressCard({ host }: { host: HostProgress }) {
  const stateTone =
    host.phase === "done"
      ? { dot: "bg-pulse-green", label: "done", cls: "text-pulse-green" }
      : host.phase === "error"
        ? { dot: "bg-coral-red", label: "error", cls: "text-coral-red" }
        : host.phase === "connecting"
          ? { dot: "bg-yellow-400", label: "connecting", cls: "text-yellow-400" }
          : host.phase === "aborted"
            ? { dot: "bg-fog/60", label: "aborted", cls: "text-fog" }
            : { dot: "bg-acid-lime", label: "working", cls: "text-acid-lime" };
  return (
    <div
      className={
        "rounded-lg border bg-carbon p-2.5 transition-colors " +
        (host.phase === "error"
          ? "border-coral-red/40"
          : host.phase === "done"
            ? "border-graphite"
            : "border-acid-lime/25")
      }
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${stateTone.dot}`} />
        <Server size={12} className="shrink-0 text-fog" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-paper">
          {host.hostLabel}
        </span>
        <span className={`shrink-0 text-[10.5px] font-medium ${stateTone.cls}`}>
          {stateTone.label}
        </span>
      </div>

      <div className="mt-2 grid gap-1.5">
        {host.commands.map((command) => (
          <div
            key={command.id}
            className={
              "rounded-md border px-2 py-1.5 " +
              (command.status === "running"
                ? "border-acid-lime/30 bg-acid-lime/5"
                : command.status === "error"
                  ? "border-coral-red/35 bg-coral-red/5"
                  : "border-graphite/80 bg-black/25")
            }
          >
            <div className="flex items-start gap-1.5">
              {command.status === "running" ? (
                <span className="spin mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
              ) : command.status === "ok" ? (
                <Check size={12} className="mt-[2px] shrink-0 text-pulse-green" />
              ) : command.status === "error" ? (
                <X size={12} className="mt-[2px] shrink-0 text-coral-red" />
              ) : (
                <ChevronRight size={12} className="mt-[2px] shrink-0 text-fog" />
              )}
              <code className="min-w-0 flex-1 break-words font-mono text-[11px] leading-relaxed text-mist">
                {command.command}
              </code>
            </div>
            {command.status === "error" && command.error ? (
              <p className="mt-1 text-[10.5px] leading-snug text-coral-red">
                {command.error}
              </p>
            ) : null}
          </div>
        ))}
        {host.commands.length === 0 ? (
          <p className="px-0.5 text-[11px] text-fog">
            {host.phase === "connecting"
              ? "Connecting with saved credential…"
              : "Queued"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
