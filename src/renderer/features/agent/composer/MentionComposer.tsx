import { ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { Send, Shield, Square } from "lucide-react";
import { useCallback } from "react";
import { ComposerTriggerPopover } from "@/components/assistant-ui/composer-trigger-popover";
import { useAgentMentionAdapter } from "./mentionAdapter";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";

export type MentionComposerProps = {
  placeholder?: string;
  autoFocus?: boolean;
  providerName?: string;
  modelName?: string;
};

export function MentionComposer({
  placeholder = "@ select a server or group, then describe the ops task…",
  autoFocus = false,
  providerName = "AI provider",
  modelName = "",
}: MentionComposerProps) {
  const mention = useAgentMentionAdapter();
  const labelEditor = useCallback((element: HTMLDivElement | null) => {
    element
      ?.querySelector<HTMLElement>(".aui-lexical-input")
      ?.setAttribute("aria-label", "Agent command");
  }, []);
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
        <div className="relative">
          <ComposerTriggerPopover
            char="@"
            {...mention}
            categoriesLabel="Select target type"
            itemsLabel="Select target"
          />
          <ComposerPrimitive.Root className="overflow-hidden rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
            <LexicalComposerInput
              ref={labelEditor}
              autoFocus={autoFocus}
              className="scroll-thin relative max-h-32 min-h-[76px] min-w-0 overflow-y-auto bg-transparent px-3 py-2.5 pr-9 text-[13px] leading-relaxed text-mist outline-hidden [&_.aui-lexical-input]:min-h-14 [&_.aui-lexical-input]:outline-hidden [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:left-3 [&_.aui-lexical-placeholder]:top-2.5 [&_.aui-lexical-placeholder]:text-fog/70"
              placeholder={placeholder}
            />
            <div className="flex items-center justify-between gap-2 border-t border-graphite/80 px-2.5 py-2">
              <span
                title="Secrets are scrubbed before leaving your machine."
                className="inline-flex items-center gap-1.5 text-[10.5px] text-fog"
              >
                <Shield className="size-3" />
                Cloud · scrubbed
              </span>
              <ThreadPrimitive.If running={false}>
                <ComposerPrimitive.Send
                  aria-label="Send Agent command"
                  title="Send"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-acid-lime px-2.5 text-[11px] font-semibold text-void outline-hidden transition hover:brightness-105 disabled:bg-graphite disabled:text-fog"
                >
                  <span>Send</span>
                  <Send className="size-[13px]" />
                </ComposerPrimitive.Send>
              </ThreadPrimitive.If>
              <ThreadPrimitive.If running>
                <ComposerPrimitive.Cancel
                  aria-label="Stop Agent"
                  title="Abort"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-coral-red/45 px-2.5 text-[11px] font-medium text-coral-red outline-hidden transition-colors hover:bg-coral-red/12"
                >
                  <Square className="size-[13px] fill-current" />
                  Abort
                </ComposerPrimitive.Cancel>
              </ThreadPrimitive.If>
            </div>
          </ComposerPrimitive.Root>
          <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-[10.5px] text-fog">
            <span className="min-w-0 truncate">
              <span className="text-mist">{providerName}</span>
              {modelName ? (
                <>
                  <span className="px-1 text-fog/50">·</span>
                  {modelName}
                </>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">@</kbd>
              <span>mention</span>
              <span className="text-fog/40">·</span>
              <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">⏎</kbd>
              <span>send</span>
            </span>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}
