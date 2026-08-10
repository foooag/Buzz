import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Sparkles } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";
import {
  DirectiveTextView,
  ReasoningPartView,
  TextPartView,
  ToolCallCard,
} from "./MessagePartViews";

export function MessageList({
  messages,
  streaming,
  streamRef,
  onCopySelection,
}: {
  messages: UIMessage[];
  streaming: boolean;
  streamRef: React.RefObject<HTMLDivElement | null>;
  onCopySelection: () => void;
}) {
  let lastAssistantIndex: number | undefined;
  messages.forEach((message, mi) => {
    if (message.role !== "assistant") return;
    if (message.parts.length > 0) lastAssistantIndex = mi;
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={streamRef}
          className="scroll-thin min-h-0 flex-1 select-text overflow-y-auto bg-carbon/60 px-4 py-3"
          onContextMenu={onCopySelection}
        >
          <div className="flex flex-col gap-3.5">
            {messages.map((message, mi) => (
              <MessageRow
                key={message.id}
                message={message}
                streaming={streaming}
                isLastAssistant={mi === lastAssistantIndex}
              />
            ))}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem onSelect={onCopySelection}>
          <Copy size={14} />
          Copy
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MessageRow({
  message,
  streaming,
  isLastAssistant,
}: {
  message: UIMessage;
  streaming: boolean;
  isLastAssistant: boolean;
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("");
    return (
      <div className="rise-in flex gap-2.5">
        <Avatar />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-fog">You</div>
          <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            <DirectiveTextView text={text} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rise-in flex gap-2.5">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-acid-lime/12 text-acid-lime">
        <Sparkles size={13} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[11px] font-medium text-acid-lime/90">Agent</div>
        {message.parts.map((part, pi) => {
          const isStreamingHere = streaming && isLastAssistant;
          if (part.type === "text") {
            return (
              <TextPartView
                key={pi}
                text={(part as { text: string }).text}
                streaming={isStreamingHere}
              />
            );
          }
          if (part.type === "reasoning") {
            return (
              <ReasoningPartView
                key={pi}
                text={(part as { text: string }).text}
                streaming={isStreamingHere}
              />
            );
          }
          if (part.type.startsWith("tool-")) {
            return <ToolCallCard key={pi} part={part as never} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-graphite text-[10px] font-semibold text-mist">
      U
    </div>
  );
}
