import {
  Check,
  ChevronRight,
  Loader2,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { HostCommandProgress, HostProgress } from "./agentItems";

export function ProgressPanel({
  hosts,
  hostLabels = {},
  onConnect,
}: {
  hosts: readonly HostProgress[];
  hostLabels?: Readonly<Record<string, string>>;
  onConnect?: () => void;
}) {
  const completed = hosts.filter((host) => host.phase === "success").length;
  const hasError = hosts.some((host) => host.phase === "error");
  return (
    <aside
      aria-label="Host progress"
      data-screen-label="Agent progress rail"
      className="flex w-[292px] min-w-0 max-w-full shrink-0 flex-col overflow-x-hidden border-l border-graphite bg-obsidian/30"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-graphite px-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">
          <SlidersHorizontal className="size-3" />
          Progress
        </div>
        <span key={`${completed}/${hosts.length}`} className="rounded-pill bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog">
          {completed}/{hosts.length} done
        </span>
      </div>
      <div className="scroll-thin grid min-h-0 min-w-0 flex-1 content-start gap-2 overflow-y-auto overflow-x-hidden p-2.5">
        {hosts.map((host) => (
          <HostProgressCard
            key={host.hostId}
            host={host}
            label={hostLabels[host.hostId] ?? host.hostId}
          />
        ))}
      </div>
      {hasError && onConnect ? (
        <div className="shrink-0 border-t border-graphite px-3.5 py-2.5">
          <button
            type="button"
            onClick={onConnect}
            className="w-full rounded-md border border-graphite px-2.5 py-1.5 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Connect hosts from Servers
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function HostProgressCard({ host, label }: { host: HostProgress; label: string }) {
  const state = phaseState(host.phase);
  return (
    <section className={`min-w-0 max-w-full rounded-lg border bg-carbon p-2.5 transition-colors ${state.border}`}>
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${state.dot}`} />
        <Server className="size-3 shrink-0 text-fog" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-paper" title={label}>
          {label}
        </span>
        <span key={state.label} className={`shrink-0 text-[10.5px] font-medium ${state.text}`}>
          {state.label}
        </span>
      </div>
      <div className="mt-2 grid min-w-0 gap-1.5">
        {host.commands.map((command) => (
          <CommandProgress key={command.toolCallId} command={command} />
        ))}
        {host.commands.length === 0 ? (
          <p className="m-0 px-0.5 text-[11px] text-fog">
            {host.phase === "idle" ? "Connecting with saved credential…" : "Queued"}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CommandProgress({ command }: { command: HostCommandProgress }) {
  const running = command.status === "running";
  const error = command.status === "error";
  return (
    <div className={`min-w-0 max-w-full rounded-md border px-2 py-1.5 ${
      running
        ? "border-acid-lime/30 bg-acid-lime/5"
        : error
          ? "border-coral-red/35 bg-coral-red/5"
          : "border-graphite/80 bg-black/25"
    }`}>
      <div className="flex min-w-0 items-start gap-1.5">
        {running ? (
          <Loader2 className="spin mt-[3px] size-2.5 shrink-0 text-acid-lime" />
        ) : command.status === "success" ? (
          <Check className="mt-0.5 size-3 shrink-0 text-pulse-green" />
        ) : error ? (
          <X className="mt-0.5 size-3 shrink-0 text-coral-red" />
        ) : (
          <ChevronRight className="mt-0.5 size-3 shrink-0 text-fog" />
        )}
        <code className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[11px] leading-relaxed text-mist">
          {command.command}
        </code>
      </div>
      {error && command.output ? (
        <p className="m-0 mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-[10.5px] leading-snug text-coral-red">{command.output}</p>
      ) : null}
    </div>
  );
}

function phaseState(phase: HostProgress["phase"]) {
  if (phase === "success") {
    return {
      label: "done",
      dot: "bg-pulse-green",
      text: "text-pulse-green",
      border: "border-graphite",
    };
  }
  if (phase === "error") {
    return {
      label: "error",
      dot: "bg-coral-red",
      text: "text-coral-red",
      border: "border-coral-red/40",
    };
  }
  if (phase === "idle") {
    return {
      label: "connecting",
      dot: "bg-yellow-400",
      text: "text-yellow-400",
      border: "border-acid-lime/25",
    };
  }
  if (phase === "awaitingConfirmation") {
    return {
      label: "approval",
      dot: "bg-coral-red",
      text: "text-coral-red",
      border: "border-coral-red/40",
    };
  }
  return {
    label: "working",
    dot: "bg-acid-lime",
    text: "text-acid-lime",
    border: "border-acid-lime/25",
  };
}
