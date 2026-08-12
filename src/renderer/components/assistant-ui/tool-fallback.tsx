import {
  type ToolCallMessagePartProps,
  type ToolCallMessagePartStatus,
} from "@assistant-ui/react";
import { Check, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import { cn } from "@/shared/utils";
import { HostExecView } from "./host-exec-output";

export type ToolFallbackStatus = "running" | "complete" | "incomplete" | "error";

export function deriveStatus(
  status: ToolCallMessagePartStatus | undefined,
  isError: boolean,
): ToolFallbackStatus {
  if (isError) return "error";
  switch (status?.type) {
    case "running":
    case "requires-action":
      return "running";
    case "incomplete":
      return "incomplete";
    default:
      return "complete";
  }
}

export type ToolFallbackRootProps = PropsWithChildren<{
  status: ToolFallbackStatus;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}>;

/**
 * Collapsible container for a single tool call. Auto-expanded while running
 * so the live state is visible without a click, collapses to the summary row
 * once complete.
 */
function ToolFallbackRoot({
  status,
  open: openProp,
  defaultOpen,
  onOpenChange,
  className,
  children,
}: ToolFallbackRootProps) {
  const initial = defaultOpen ?? (status === "running" || status === "incomplete");
  const [openState, setOpenState] = useState(initial);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open;
        if (next !== open) setOpen(next);
      }}
      className={cn(
        "rise-in overflow-hidden rounded-lg border border-graphite/60 bg-obsidian/40",
        className,
      )}
    >
      {children}
    </details>
  );
}

export type ToolFallbackTriggerProps = {
  status: ToolFallbackStatus;
  toolName: string;
  /** Optional leading label rendered before the tool name (e.g. host name). */
  prefix?: ReactNode;
  /** Optional trailing node rendered at the right of the row (e.g. exit code). */
  suffix?: ReactNode;
};

function ToolFallbackTrigger({
  status,
  toolName,
  prefix,
  suffix,
}: ToolFallbackTriggerProps) {
  return (
    <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-3 py-2 text-[11.5px] text-fog transition-colors hover:text-mist">
      <ChevronRight className="size-3 shrink-0 text-fog/70 transition-transform group/details:rotate-90" />
      <StatusIcon status={status} />
      {prefix ? <span className="text-mist/80">{prefix}</span> : null}
      <span className="font-mono font-medium text-mist">{toolName}</span>
      <span className="ml-auto flex items-center gap-1.5">{suffix}</span>
    </summary>
  );
}

function StatusIcon({ status }: { status: ToolFallbackStatus }) {
  if (status === "running")
    return <Loader2 className="spin size-3 text-acid-lime" />;
  if (status === "error")
    return <TriangleAlert className="size-3 text-coral-red" />;
  if (status === "incomplete")
    return <TriangleAlert className="size-3 text-fog/70" />;
  return <Check className="size-3 text-pulse-green" />;
}

function ToolFallbackContent({ children }: PropsWithChildren) {
  return (
    <div className="group/details border-t border-graphite/60 px-3 py-2.5">
      {children}
    </div>
  );
}

/** Render tool args as a compact key/value block. */
function ToolFallbackArgs({ args }: { args: unknown }) {
  const entries = toEntries(args);
  if (!entries.length) return null;
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11.5px] leading-relaxed">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-fog/80">{key}</dt>
          <dd className="m-0 whitespace-pre-wrap break-words text-mist/90">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Render a generic tool result (non-host_exec) as readable text, not raw JSON. */
function ToolFallbackResult({ result, isError }: { result: unknown; isError: boolean }) {
  const text = stringifyResult(result, isError);
  if (!text) return null;
  return (
    <pre
      className={cn(
        "scroll-thin m-0 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-graphite/60 bg-black/40 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed",
        isError ? "text-coral-red" : "text-mist/90",
      )}
    >
      {text}
    </pre>
  );
}

export const ToolFallback = {
  Root: ToolFallbackRoot,
  Trigger: ToolFallbackTrigger,
  Content: ToolFallbackContent,
  Args: ToolFallbackArgs,
  Result: ToolFallbackResult,
};

/**
 * Default ToolFallback renderer: branches on tool name. `host_exec` renders
 * the SSH terminal view (real stdout/stderr, exit code); every other tool
 * renders a generic args + result block.
 */
export function ToolFallbackRenderer({
  toolName,
  args,
  result,
  isError,
  status,
}: ToolCallMessagePartProps) {
  const failed = isError ?? false;
  const derived = deriveStatus(status, failed);

  if (toolName === "host_exec") {
    return (
      <ToolFallback.Root status={derived} className="group/details">
        <ToolFallback.Trigger
          status={derived}
          toolName="host_exec"
          prefix={args && typeof args === "object" && "hostId" in args
            ? String((args as { hostId?: unknown }).hostId ?? "")
            : undefined}
        />
        <ToolFallback.Content>
          <HostExecView
            args={args as { hostId?: string; command?: string; cwd?: string } | undefined}
            result={result}
            isError={failed}
          />
        </ToolFallback.Content>
      </ToolFallback.Root>
    );
  }

  return (
    <ToolFallback.Root status={derived} className="group/details">
      <ToolFallback.Trigger status={derived} toolName={toolName} />
      <ToolFallback.Content>
        <ToolFallback.Args args={args} />
        {result !== undefined ? (
          <ToolFallback.Result result={result} isError={failed} />
        ) : null}
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
}

function toEntries(args: unknown): [string, string][] {
  if (!args || typeof args !== "object") return [];
  return Object.entries(args as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, stringifyValue(value)]);
}

function stringifyResult(result: unknown, isError: boolean): string {
  const unwrapped = unwrapResult(result, isError);
  return typeof unwrapped === "string" && unwrapped.trim()
    ? unwrapped
    : stringifyValue(unwrapped);
}

/**
 * Unwrap an AgentToolResult `{ content, details }`. For non-host_exec tools we
 * still prefer readable details/text over the raw wrapper object.
 */
function unwrapResult(result: unknown, isError: boolean): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  const hasContent = Array.isArray(record.content);
  const hasDetails = "details" in record;
  if (!hasContent && !hasDetails) return result;

  if (isError) {
    const text = (record.content as { text?: unknown }[] | undefined)
      ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    return text || record.details || result;
  }
  // details may itself be a usable object; fall back to the content text.
  const details = record.details;
  if (details && typeof details === "object" && Object.keys(details).length) {
    return details;
  }
  const text = (record.content as { text?: unknown }[] | undefined)
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || details || result;
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
