import {
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { Sparkles } from "lucide-react";
import { DirectiveText } from "@/components/assistant-ui/directive-text";
import { StreamdownText } from "@/components/assistant-ui/streamdown-text";
import { ToolFallbackRenderer } from "@/components/assistant-ui/tool-fallback";
import { ToolGroupRoot } from "@/components/assistant-ui/tool-group";

export function AgentMessages() {
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
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-thought", "group-reasoning"],
            "tool-call": ["group-thought", "group-tool"],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-thought":
                return <ThoughtGroup>{children}</ThoughtGroup>;
              case "group-reasoning":
                return <ReasoningGroup>{children}</ReasoningGroup>;
              case "group-tool":
                return (
                  <ToolGroupRoot
                    variant="ghost"
                    count={part.indices.length}
                    active={part.status.type === "running"}
                  >
                    {children}
                  </ToolGroupRoot>
                );
              case "text":
                return <StreamdownText />;
              case "reasoning":
                return <ReasoningChunk text={part.text} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackRenderer {...part} />;
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
      </div>
    </MessagePrimitive.Root>
  );
}

function ReasoningChunk({ text }: { text: string }) {
  return <>{text}</>;
}

function ThoughtGroup({ children }: { children: React.ReactNode }) {
  return (
    <details
      className="rounded-lg border border-graphite/70 bg-obsidian/40 px-3 py-2 text-fog"
      open
    >
      <summary className="cursor-pointer text-[11px] font-medium">Reasoning</summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}

function ReasoningGroup({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 whitespace-pre-wrap text-[11.5px] leading-relaxed">
      {children}
    </p>
  );
}
