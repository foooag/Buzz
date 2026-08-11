import {
  MessagePrimitive,
  ThreadPrimitive,
  type ReasoningMessagePartProps,
  type TextMessagePartProps,
  type ToolCallMessagePartProps,
  useAssistantToolUI,
} from "@assistant-ui/react";
import { Bot, Server, User } from "lucide-react";
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
    <MessagePrimitive.Root className="ml-auto flex max-w-[82%] items-start gap-2.5 rounded-xl border border-graphite bg-graphite/45 px-3.5 py-3 text-[13px] text-mist">
      <User className="mt-0.5 size-4 shrink-0 text-fog" />
      <div className="min-w-0">
        <MessagePrimitive.Parts components={{ Text: DirectiveText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mr-auto flex w-full max-w-[92%] items-start gap-2.5 text-[13px] text-mist">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-acid-lime/20 bg-acid-lime/8 text-acid-lime">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
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
  return <p className="m-0 whitespace-pre-wrap wrap-break-word leading-relaxed">{text}</p>;
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
  return (
    <div className="overflow-hidden rounded-xl border border-graphite bg-obsidian/70">
      <div className="flex items-center gap-2 border-b border-graphite px-3 py-2 text-[11px] text-fog">
        <Server className="size-3.5 text-acid-lime" />
        <span>{args.hostId ?? "host"}</span>
        <span className={`ml-auto ${isError ? "text-coral-red" : result === undefined ? "text-fog" : "text-pulse-green"}`}>
          {isError ? "Failed" : result === undefined ? "Running" : "Complete"}
        </span>
      </div>
      <code className="block overflow-x-auto px-3 py-2 font-mono text-[11.5px] text-mist">
        $ {args.command ?? "command"}
      </code>
      {result !== undefined ? (
        <pre className="scroll-thin m-0 max-h-48 overflow-auto border-t border-graphite bg-void/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-fog">
          {formatResult(result)}
        </pre>
      ) : null}
    </div>
  );
}

function ToolFallback({ toolName, args, result, isError }: ToolCallMessagePartProps) {
  return (
    <div className="rounded-lg border border-graphite bg-obsidian/60 p-3 text-[11px] text-fog">
      <p className="m-0 font-medium text-mist">{toolName}{isError ? " failed" : ""}</p>
      <pre className="scroll-thin mb-0 overflow-auto">{formatResult(result ?? args)}</pre>
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
