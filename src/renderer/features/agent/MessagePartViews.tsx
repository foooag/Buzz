import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Server, X } from "lucide-react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import { parseDirectiveChips } from "./mention/directiveFormat";
import type { UIMessage } from "@ai-sdk/react";

type AnyPart = UIMessage["parts"][number];
type ToolPart = AnyPart & {
  toolCallId: string;
  toolName: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: { hostId?: string; command?: string } & Record<string, unknown>;
  output?: {
    result?: unknown;
    isError?: boolean;
    timing?: { startedAt?: number; completedAt?: number };
    approval?: { isAutomatic?: boolean; reason?: string };
  };
  errorText?: string;
};

/**
 * Renders text with inline `:host[...]{name=...}` / `:group[...]{name=...}`
 * directive chips as inline styled spans (no Badge dependency).
 *
 * Each chip exposes `aria-label` (formatted as `${type}: ${label}`) plus the
 * `data-directive-type` / `data-directive-id` attributes consumed by e2e and
 * AgentPage tests.
 */
export function DirectiveTextView({ text }: { text: string }) {
  const chips = parseDirectiveChips(text);
  if (chips.length === 1 && chips[0]!.kind === "text") return <>{text}</>;
  return (
    <>
      {chips.map((chip, i) =>
        chip.kind === "text" ? (
          <span key={i} className="whitespace-pre-wrap">
            {chip.text}
          </span>
        ) : (
          <span
            key={i}
            data-directive-type={chip.type}
            data-directive-id={chip.id}
            aria-label={`${chip.type}: ${chip.label}`}
            className="mx-0.5 inline-flex items-center rounded bg-acid-lime/12 px-1.5 py-0.5 text-[12px] text-acid-lime"
          >
            {chip.label}
          </span>
        ),
      )}
    </>
  );
}

/**
 * Plain text message part. When `streaming` is true (typically only for the
 * last assistant text part) we render the `stream-caret` class so the caret
 * animation matches the legacy AgentTextPart behaviour.
 */
export function TextPartView({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  if (!text) return null;
  return (
    <div
      className={
        "mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-mist " +
        (streaming ? "stream-caret" : "")
      }
    >
      {text}
    </div>
  );
}

/**
 * Reasoning part rendered as an auto-expanding `<details>`. While streaming,
 * the details element is forced open via a ref effect (ported verbatim from
 * the legacy `AgentReasoningPart`).
 */
export function ReasoningPartView({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.open = true;
  }, [text]);
  return (
    <details ref={ref} className="group mt-1 text-fog" open>
      <summary className="cursor-pointer select-none text-[11px]">
        Thinking
      </summary>
      <div
        className={
          "mt-1 whitespace-pre-wrap break-words border-l border-graphite pl-3 text-[12px] leading-relaxed " +
          (streaming ? "stream-caret" : "")
        }
      >
        {text}
      </div>
    </details>
  );
}

type ToolViewStatus =
  | "running"
  | "done"
  | "error"
  | "credential-missing"
  | "declined"
  | "aborted";

function VerdictChip({ allow }: { allow: boolean }) {
  return allow ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-pulse-green/12 px-2 py-0.5 text-[11px] font-medium text-pulse-green">
      <span className="h-1.5 w-1.5 rounded-full bg-pulse-green" />
      auto-run
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-red/12 px-2 py-0.5 text-[11px] font-medium text-coral-red">
      <span className="h-1.5 w-1.5 rounded-full bg-coral-red" />
      high risk
    </span>
  );
}

function AgentStatusBadge({
  status,
  exitCode,
}: {
  status: ToolViewStatus;
  exitCode?: number | null;
}) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-mist">
        <span className="spin h-3 w-3 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
        running
      </span>
    );
  }
  if (status === "credential-missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        needs credential
      </span>
    );
  }
  if (status === "declined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        declined
      </span>
    );
  }
  if (status === "aborted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-graphite px-2 py-0.5 text-[11px] text-fog">
        aborted
      </span>
    );
  }
  const ok = status === "done" && (exitCode === 0 || exitCode == null);
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (ok ? "bg-pulse-green/12 text-pulse-green" : "bg-coral-red/12 text-coral-red")
      }
    >
      {ok ? <Check size={12} /> : <X size={12} />}
      {status === "done" ? `exit ${exitCode ?? "—"}` : "failed"}
    </span>
  );
}

/**
 * Tool call card ported from the legacy `AgentToolCallPart` in AgentPage.tsx.
 *
 * Field-source mapping (the core adaptation from wire `AgentToolCallPart` to
 * AI SDK tool part):
 * - `args = part.input ?? {}`; `hostId = args.hostId`; `command = args.command`
 * - `result = part.output?.result`
 * - `isError = part.output?.isError ?? part.state === "output-error"`
 * - `timing = part.output?.timing`
 * - `approval = part.output?.approval`
 * - `running = part.state === "input-available" || part.state === "input-streaming"`
 *
 * The helpers below (`resultDetails`, `commandOutput`, `errorCode`, etc.)
 * operate on plain values and are ported verbatim from AgentPage.tsx.
 */
export function ToolCallCard({ part }: { part: ToolPart }) {
  const { toolName, input, output, state } = part;
  const args = input ?? {};
  const result = output?.result;
  const isError = output?.isError ?? state === "output-error";
  const timing = output?.timing;
  const approval = output?.approval;
  const running = state === "input-available" || state === "input-streaming";

  const [expanded, setExpanded] = useState(false);
  const parsedArgs = toolArgs({ args });
  const hostId = parsedArgs.hostId ?? "unknown";
  const hostLabel = useInventoryStore(
    (store) => store.hosts[hostId]?.name ?? hostId,
  );
  const details = resultDetails(result);
  const code = errorCode(result);
  const failed = Boolean(isError) || isNonZeroExit(details?.exitCode);
  const status: ToolViewStatus = code === "AGENT_HOST_CREDENTIAL_MISSING"
    ? "credential-missing"
    : code === "AGENT_DECLINED"
      ? "declined"
      : running
        ? "running"
        : failed
          ? "error"
          : "done";
  const failureMessage = failed ? toolFailureMessage(result, details) : undefined;
  const outputText = commandOutput(details) ?? failureMessage;
  const lines = outputText ? outputText.split("\n").filter(Boolean) : [];
  const excerpt = 5;
  const showExpand = lines.length > excerpt;
  const visible = expanded ? lines : lines.slice(0, excerpt);
  const durationMs = timing?.completedAt === undefined || timing?.startedAt === undefined
    ? undefined
    : timing.completedAt - timing.startedAt;

  return (
    <div className="rise-in overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <VerdictChip allow={!approval || approval.isAutomatic === true} />
        <AgentStatusBadge status={status} exitCode={details?.exitCode} />
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-start gap-2 font-mono text-[12.5px] leading-relaxed text-mist">
          <span className="select-none text-fog">$</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {parsedArgs.command ?? toolName}
          </span>
        </div>
      </div>

      {status === "running" ? (
        <div className="mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-fog">
          <span className="c-dim">capturing output…</span>
        </div>
      ) : lines.length > 0 ? (
        <div
          className={
            "mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed " +
            (failed ? "text-coral-red/90" : "text-mist/90")
          }
        >
          {visible.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-graphite/70 px-3 py-1.5 text-[11px] text-fog">
        <div className="flex min-w-0 items-center gap-2">
          {durationMs !== undefined && status === "done" ? (
            <span className="shrink-0">{formatDuration(durationMs)}</span>
          ) : null}
          <span className="inline-flex min-w-0 items-center gap-1">
            <Server size={11} className="shrink-0" />
            <span className="truncate">{hostLabel}</span>
          </span>
        </div>
        {showExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex shrink-0 items-center gap-1 rounded text-fog transition-colors hover:text-mist"
          >
            <ChevronDown size={12} className={expanded ? "rotate-180" : ""} />
            {expanded ? "Show less" : `Expand (${lines.length - excerpt} more)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// --- Helpers (ported verbatim from AgentPage.tsx) ----------------------------

function toolArgs(part: { args?: unknown }): {
  hostId?: string;
  command?: string;
} {
  if (!part.args || typeof part.args !== "object") return {};
  const args = part.args as Record<string, unknown>;
  return {
    hostId: typeof args.hostId === "string" ? args.hostId : undefined,
    command: typeof args.command === "string" ? args.command : undefined,
  };
}

function resultDetails(
  result: unknown,
): { stdout?: string; stderr?: string; exitCode?: number | null } | undefined {
  if (!result || typeof result !== "object") return undefined;
  const wrapped = (result as { details?: unknown }).details;
  const value = (wrapped && typeof wrapped === "object" ? wrapped : result) as {
    stdout?: unknown;
    stderr?: unknown;
    exitCode?: unknown;
  };
  if (
    typeof value.stdout !== "string" &&
    typeof value.stderr !== "string" &&
    typeof value.exitCode !== "number"
  ) {
    return undefined;
  }
  return {
    stdout: typeof value.stdout === "string" ? value.stdout : undefined,
    stderr: typeof value.stderr === "string" ? value.stderr : undefined,
    exitCode: typeof value.exitCode === "number" ? value.exitCode : null,
  };
}

function commandOutput(
  details: ReturnType<typeof resultDetails>,
): string | undefined {
  if (!details) return undefined;
  const parts = [details.stdout, details.stderr]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trimEnd());
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function isNonZeroExit(exitCode: number | null | undefined): boolean {
  return typeof exitCode === "number" && exitCode !== 0;
}

function toolFailureMessage(
  result: unknown,
  details: ReturnType<typeof resultDetails>,
): string {
  return (
    commandOutput(details) ??
    errorMessage(result) ??
    (typeof details?.exitCode === "number"
      ? `Command exited with code ${details.exitCode}.`
      : "The command failed without an error message.")
  );
}

function errorCode(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}
