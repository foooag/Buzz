import {
  MessagePrimitive,
  ThreadPrimitive,
  type ReasoningMessagePartProps,
  type TextMessagePartProps,
  type ToolCallMessagePartProps,
  useAssistantToolUI,
} from "@assistant-ui/react";
import { Check, Loader2, Server, Sparkles, TriangleAlert, X } from "lucide-react";
import { DirectiveText } from "@/components/assistant-ui/directive-text";

export function AgentMessages() {
  useAssistantToolUI({ toolName: "host_exec", render: HostExecCard });
  return (
    <ThreadPrimitive.Messages
      components={{
        UserMessage,
        AssistantMessage,
      }}
    />
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="rise-in flex gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-graphite text-[10px] font-semibold text-mist">
        U
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[11px] font-medium text-fog">You</div>
        <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
          <MessagePrimitive.Parts components={{ Text: DirectiveText }} />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="rise-in flex gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-acid-lime/12 text-acid-lime">
        <Sparkles className="size-[13px]" />
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="text-[11px] font-medium text-acid-lime/90">Agent</div>
        <MessagePrimitive.Parts
          components={{
            Text: PlainText,
            Reasoning,
            tools: {
              by_name: { host_exec: HostExecCard },
              Fallback: ToolFallback,
            },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function PlainText({ text }: TextMessagePartProps) {
  return <p className="m-0 whitespace-pre-wrap wrap-break-word text-[13px] leading-relaxed text-mist">{text}</p>;
}

function Reasoning({ text }: ReasoningMessagePartProps) {
  return (
    <details className="rounded-lg border border-graphite/70 bg-obsidian/40 px-3 py-2 text-fog">
      <summary className="cursor-pointer text-[11px] font-medium">Reasoning</summary>
      <p className="mb-0 whitespace-pre-wrap text-[11.5px] leading-relaxed">{text}</p>
    </details>
  );
}

export function HostExecCard({
  args,
  result,
  isError,
}: ToolCallMessagePartProps<{ hostId?: string; command?: string }, unknown>) {
  const output = result === undefined ? "" : formatResult(result);
  return (
    <div className="rise-in overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[11px] font-medium text-pulse-green">
          <span className="size-1.5 rounded-full bg-pulse-green" />
          auto-run
        </span>
        {result === undefined ? (
          <span key="running" className="inline-flex items-center gap-1.5 text-[11px] text-mist">
            <Loader2 className="spin size-3" />
            running
          </span>
        ) : (
          <span key={isError ? "failed" : "complete"} className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium ${
            isError
              ? "bg-coral-red/12 text-coral-red"
              : "bg-pulse-green/12 text-pulse-green"
          }`}>
            {isError ? <X className="size-3" /> : <Check className="size-3" />}
            {isError ? "failed" : "complete"}
          </span>
        )}
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-start gap-2 font-mono text-[12.5px] leading-relaxed text-mist">
          <span className="select-none text-fog">$</span>
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-words">{args.command ?? "command"}</code>
        </div>
      </div>
      {result === undefined ? (
        <div className="mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-fog">
          <span className="c-dim">capturing output…</span>
        </div>
      ) : output ? (
        <pre className={`scroll-thin mx-3 mb-2.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed ${
          isError ? "text-coral-red" : "text-mist/90"
        }`}>
          {output}
        </pre>
      ) : null}
      <div className="flex items-center gap-1 border-t border-graphite/70 px-3 py-1.5 text-[11px] text-fog">
        <Server className="size-[11px] shrink-0" />
        <span className="truncate">{args.hostId ?? "host"}</span>
      </div>
    </div>
  );
}

function ToolFallback({ toolName, args, result, isError }: ToolCallMessagePartProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-fog">
        {isError ? <TriangleAlert className="size-3.5 text-coral-red" /> : <Sparkles className="size-3.5 text-acid-lime" />}
        <span className="font-medium text-mist">{toolName}</span>
      </div>
      <pre className="scroll-thin m-0 max-h-48 overflow-auto border-t border-graphite bg-black/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-fog">
        {formatResult(result ?? args)}
      </pre>
    </div>
  );
}

function formatResult(value: unknown): string {
  if (value && typeof value === "object") {
    const result = value as Record<string, unknown>;
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    if (stdout || stderr) return [stdout, stderr].filter(Boolean).join("\n");
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
