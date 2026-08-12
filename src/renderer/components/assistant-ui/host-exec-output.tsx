import { Server } from "lucide-react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";

/**
 * Shape of an `AgentToolResult` as it arrives on the renderer side
 * (`toolEnd.result`). The agent runtime emits the *whole* result, not the
 * bare `SshCommandResult`, so we must unwrap `.details`. On error,
 * `details` is `{}` and the message lives in `.content[].text`.
 *
 * @see src/main/domains/agent/agent-runtime.ts (host_exec returns `{ content, details }`)
 * @see src/main/domains/ssh/runtime.ts (SshCommandResult)
 */
type AgentToolResultLike = {
  content?: { type?: string; text?: unknown }[];
  details?: unknown;
};

type SshCommandDetails = {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  truncated?: boolean;
};

export type HostExecOutput = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
};

/** Unwrap a host_exec tool result into a plain terminal-style payload. */
export function extractToolOutput(
  result: unknown,
  isError: boolean,
): HostExecOutput | null {
  if (result === undefined) return null;

  // Bare SshCommandResult (defensive — in case the wrapper is ever stripped).
  const direct = asSshDetails(result);
  if (direct && (direct.stdout || direct.stderr || direct.exitCode != null)) {
    return normalize(direct);
  }

  const wrapped = result as AgentToolResultLike;
  if (!isError) {
    const details = asSshDetails(wrapped.details);
    if (details) return normalize(details);
    return empty();
  }

  // Error path: the message is in content[].text (createErrorToolResult sets details={}).
  const message = (wrapped.content ?? [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return { ...empty(), stderr: message };
}

function asSshDetails(value: unknown): SshCommandDetails | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.stdout !== "string" &&
    typeof record.stderr !== "string" &&
    record.exitCode !== undefined &&
    typeof record.truncated !== "boolean"
  ) {
    return null;
  }
  return {
    stdout: typeof record.stdout === "string" ? record.stdout : "",
    stderr: typeof record.stderr === "string" ? record.stderr : "",
    exitCode:
      typeof record.exitCode === "number" ? record.exitCode : null,
    truncated: record.truncated === true,
  };
}

function normalize(details: SshCommandDetails): HostExecOutput {
  return {
    stdout: details.stdout ?? "",
    stderr: details.stderr ?? "",
    exitCode: details.exitCode ?? null,
    truncated: details.truncated === true,
  };
}

function empty(): HostExecOutput {
  return { stdout: "", stderr: "", exitCode: null, truncated: false };
}

export type HostExecViewProps = {
  args: { hostId?: string; command?: string; cwd?: string } | undefined;
  /** The full tool result (may be undefined while running). */
  result: unknown;
  isError: boolean;
};

/**
 * SSH-style terminal view for a single host_exec call: prompt line, captured
 * stdout/stderr, and an exit-code footer. Renders "capturing output…" while
 * the command is still running (result undefined).
 */
export function HostExecView({ args, result, isError }: HostExecViewProps) {
  const hostName = useInventoryStore(
    (state) => (args?.hostId ? state.hosts[args.hostId]?.name : undefined),
  ) ?? args?.hostId ?? "host";
  const running = result === undefined;
  const output = extractToolOutput(result, isError);
  const hasStderr = Boolean(output?.stderr);
  const hasStdout = Boolean(output?.stdout);
  const failed = isError || (output != null && output.exitCode != null && output.exitCode !== 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-fog">
        <Server className="size-[11px] shrink-0 text-fog/80" />
        <span className="truncate font-medium text-mist/90">{hostName}</span>
        {args?.cwd ? (
          <span className="c-dim truncate font-mono">· {args.cwd}</span>
        ) : null}
      </div>
      <div className="flex items-start gap-2 font-mono text-[12.5px] leading-relaxed text-mist">
        <span className="select-none text-fog">$</span>
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          {args?.command ?? "command"}
        </code>
      </div>
      {running ? (
        <div className="rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-fog">
          <span className="c-dim">capturing output…</span>
        </div>
      ) : output && (hasStdout || hasStderr) ? (
        <pre
          className={`scroll-thin max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed ${
            failed ? "text-coral-red" : "text-mist/90"
          }`}
        >
          {[output.stdout, output.stderr].filter(Boolean).join("\n")}
        </pre>
      ) : null}
      {output && !running && (output.exitCode != null || output.truncated) ? (
        <div className="flex items-center gap-2 font-mono text-[11px] text-fog">
          {output.exitCode != null ? (
            <span className={output.exitCode === 0 ? "text-pulse-green" : "text-coral-red"}>
              exit {output.exitCode}
            </span>
          ) : null}
          {output.truncated ? (
            <span className="c-dim">· output truncated</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
