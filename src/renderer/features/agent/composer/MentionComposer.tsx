import { ComposerPrimitive } from "@assistant-ui/react";
import { ArrowUp, Square } from "lucide-react";
import { useCallback } from "react";
import { ComposerTriggerPopover } from "@/components/assistant-ui/composer-trigger-popover";
import { useAgentMentionAdapter } from "./mentionAdapter";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";

export type MentionComposerProps = {
  placeholder?: string;
  autoFocus?: boolean;
};

export function MentionComposer({
  placeholder = "Ask Agent to inspect or operate on @servers…",
  autoFocus = false,
}: MentionComposerProps) {
  const mention = useAgentMentionAdapter();
  const labelEditor = useCallback((element: HTMLDivElement | null) => {
    element
      ?.querySelector<HTMLElement>(".aui-lexical-input")
      ?.setAttribute("aria-label", "Agent command");
  }, []);
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="relative">
        <ComposerTriggerPopover
          char="@"
          {...mention}
          categoriesLabel="Select target type"
          itemsLabel="Select target"
        />
        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border border-graphite bg-carbon p-2 shadow-lg focus-within:border-acid-lime/45">
          {/* <ComposerPrimitive.Input
            aria-label="Agent command"
            autoFocus={autoFocus}
            className="scroll-thin max-h-40 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-[13px] leading-relaxed text-paper outline-hidden placeholder:text-fog"
            placeholder={placeholder}
            rows={1}
          /> */}
          <LexicalComposerInput
            ref={labelEditor}
            autoFocus={autoFocus}
            className="scroll-thin max-h-40 min-h-11 min-w-0 flex-1 overflow-y-auto bg-transparent px-2 py-2 text-[13px] leading-relaxed text-paper outline-hidden"
            placeholder={placeholder}
          />
          <ComposerPrimitive.Send
            aria-label="Send Agent command"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-acid-lime text-void outline-hidden transition hover:bg-acid-lime/85 disabled:hidden"
          >
            <ArrowUp className="size-4" />
          </ComposerPrimitive.Send>
          <ComposerPrimitive.Cancel
            aria-label="Stop Agent"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-coral-red/40 bg-coral-red/10 text-coral-red outline-hidden transition hover:bg-coral-red/20 disabled:hidden"
          >
            <Square className="size-3.5 fill-current" />
          </ComposerPrimitive.Cancel>
        </ComposerPrimitive.Root>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}
