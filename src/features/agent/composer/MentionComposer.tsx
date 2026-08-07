import { useEffect, useMemo, useRef } from "react";
import { Folder, Send, Server, ShieldCheck, Square } from "lucide-react";
import {
  ComposerPrimitive,
  unstable_defaultDirectiveFormatter,
  unstable_useComposerInput,
} from "@assistant-ui/react";
import { ComposerTriggerPopover } from "@/components/assistant-ui/composer-trigger-popover";
import type { Group, Host } from "@/shared/types";
import {
  mentionSourceVersion,
  useAgentMentionCompletionAdapter,
  useMentionSources,
} from "./mentionAdapter";

export type MentionComposerDraft = {
  text: string;
  nonce: number;
};

type MentionComposerProps = {
  onAbort?: () => void;
  onTextChange?: (text: string) => void;
  busy: boolean;
  awaitingConfirm: boolean;
  disabled?: boolean;
  providerLabel?: string;
  draft?: MentionComposerDraft;
};

export function MentionComposer({
  onAbort,
  onTextChange,
  busy,
  awaitingConfirm,
  disabled,
  providerLabel,
  draft,
}: MentionComposerProps) {
  const { hosts, groups, status } = useMentionSources();
  const sourceVersion = useMemo(
    () => mentionSourceVersion(hosts, groups, status),
    [groups, hosts, status],
  );

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
        <div className="relative">
          <AgentMentionPopover
            key={sourceVersion}
            hosts={hosts}
            groups={groups}
            enabled={status === "ready"}
          />
          <ComposerPrimitive.Root className="relative rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
            <ComposerTextBridge
              draft={draft}
              disabled={disabled || awaitingConfirm}
              onTextChange={onTextChange}
            />
            <ComposerPrimitive.Input
              aria-label="Message agent"
              disabled={disabled || awaitingConfirm}
              placeholder="@ 选择服务器或分组，描述要执行的运维操作…"
              className="scroll-thin max-h-32 min-h-[76px] w-full resize-none bg-transparent px-3 py-2.5 pr-9 text-[13px] leading-relaxed text-mist outline-none placeholder:text-fog/70"
            />
            <div className="flex items-center justify-between gap-2 border-t border-graphite/80 px-2.5 py-2">
              <span
                title="Secrets are scrubbed before leaving your machine (best-effort regex redaction)."
                className="inline-flex items-center gap-1.5 text-[10.5px] text-fog"
              >
                <ShieldCheck size={12} />
                Cloud · scrubbed
              </span>
              {busy ? (
                <button
                  type="button"
                  onClick={() => onAbort?.()}
                  title="Abort (Esc)"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-coral-red/45 px-2.5 text-[11px] font-medium text-coral-red transition-colors hover:bg-coral-red/12"
                >
                  <Square size={13} />
                  Abort
                </button>
              ) : (
                <ComposerPrimitive.Send
                  aria-label="Send"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors disabled:bg-graphite disabled:text-fog disabled:hover:bg-graphite disabled:hover:text-fog enabled:bg-acid-lime enabled:text-void enabled:hover:brightness-105"
                >
                  <span>Send</span>
                  <Send size={13} />
                </ComposerPrimitive.Send>
              )}
            </div>
          </ComposerPrimitive.Root>
          <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-[10.5px] text-fog">
            <span className="min-w-0 truncate">
              {providerLabel ? (
                <span className="text-mist">{providerLabel}</span>
              ) : (
                <span className="text-fog/70">No provider configured</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">
                @
              </kbd>
              <span>mention</span>
              <span className="text-fog/40">·</span>
              <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">
                {busy ? "Esc" : "⏎"}
              </kbd>
              <span>{busy ? "abort" : "send"}</span>
            </span>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}

function ComposerTextBridge({
  disabled,
  draft,
  onTextChange,
}: {
  disabled: boolean | undefined;
  draft: MentionComposerDraft | undefined;
  onTextChange: ((text: string) => void) | undefined;
}) {
  const appliedDraftNonceRef = useRef<number | undefined>(undefined);
  const { value, setText } = unstable_useComposerInput({ disabled });

  useEffect(() => {
    if (!draft || appliedDraftNonceRef.current === draft.nonce) return;
    appliedDraftNonceRef.current = draft.nonce;
    setText(draft.text);
  }, [draft, setText]);

  useEffect(() => {
    onTextChange?.(value);
  }, [value, onTextChange]);

  return null;
}

function AgentMentionPopover({
  hosts,
  groups,
  enabled,
}: {
  hosts: Host[];
  groups: Group[];
  enabled: boolean;
}) {
  const mention = useAgentMentionCompletionAdapter({
    hosts,
    groups,
    enabled,
  });

  return (
    <ComposerTriggerPopover
      char="@"
      adapter={mention.adapter}
      isLoading={mention.isLoading}
      directive={{ formatter: unstable_defaultDirectiveFormatter }}
      iconMap={{ Folder, Server }}
      fallbackIcon={Server}
      aria-label="Mention target"
      loadingLabel="正在加载服务器和分组…"
      emptyItemsLabel="没有匹配的服务器或分组"
      emptyCategoriesLabel="没有可用的服务器或分组"
      className="pop-in bottom-[calc(100%+6px)] mb-0 w-[min(320px,calc(100%-8px))] border-graphite bg-carbon text-mist shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
    />
  );
}
