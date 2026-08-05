import {
  useEffect,
  useMemo,
  type ComponentProps,
} from "react";
import {
  Folder,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import {
  ComposerPrimitive,
  unstable_useComposerInput,
  unstable_useTriggerPopoverScopeContextOptional,
  type Unstable_DirectiveFormatter,
  type Unstable_TriggerItem,
} from "@assistant-ui/react";
import type { Host } from "@/shared/types";
import { useAgentMentionAdapter, useMentionSources } from "./mentionAdapter";

export type MentionComposerDraft = {
  text: string;
  nonce: number;
};

type MentionAdapter = NonNullable<
  ComponentProps<typeof ComposerPrimitive.Unstable_TriggerPopover>["adapter"]
>;

type MentionComposerProps = {
  onAbort?: () => void;
  busy: boolean;
  awaitingConfirm: boolean;
  disabled?: boolean;
  providerLabel?: string;
  draft?: MentionComposerDraft;
};

export function MentionComposer({
  onAbort,
  busy,
  awaitingConfirm,
  disabled,
  providerLabel,
  draft,
}: MentionComposerProps) {
  const mention = useAgentMentionAdapter();
  const { hosts } = useMentionSources();
  const hostById = useMemo(
    () => new Map(hosts.map((host) => [host.id, host])),
    [hosts],
  );
  const { setText } = unstable_useComposerInput({
    disabled: disabled || awaitingConfirm,
  });

  useEffect(() => {
    if (draft) setText(draft.text);
  }, [draft, setText]);

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
        <div className="relative">
          <AgentMentionPopover
            adapter={mention.adapter}
            formatter={mention.directive.formatter}
            hostById={hostById}
            hosts={hosts}
          />
          <ComposerPrimitive.Root className="rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
            <ComposerPrimitive.Input
              aria-label="Message agent"
              placeholder="@ 选择服务器或分组，描述要执行的运维操作…"
              rows={3}
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

function AgentMentionPopover({
  adapter,
  formatter,
  hostById,
  hosts,
}: {
  adapter: MentionAdapter;
  formatter: Unstable_DirectiveFormatter;
  hostById: Map<string, Host>;
  hosts: Host[];
}) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      char="@"
      adapter={adapter}
      aria-label="Mention target"
      className="pop-in absolute bottom-[calc(100%+6px)] left-0 z-30 w-[min(320px,calc(100%-8px))] overflow-hidden rounded-xl border border-graphite bg-carbon shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive
        formatter={formatter}
      />
      <MentionPopoverContent
        hostById={hostById}
        hosts={hosts}
      />
    </ComposerPrimitive.Unstable_TriggerPopover>
  );
}

function MentionPopoverContent({
  hostById,
  hosts,
}: {
  hostById: Map<string, Host>;
  hosts: Host[];
}) {
  const scope = unstable_useTriggerPopoverScopeContextOptional();
  if (!scope?.open) return null;
  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-graphite px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">
        <Sparkles size={11} className="text-acid-lime" />
        Mention target
      </div>
      <ComposerPrimitive.Unstable_TriggerPopoverItems className="scroll-thin max-h-[264px] overflow-y-auto p-1.5">
        {(items) => (
          <MentionItems
            items={items}
            query={scope.query}
            hostById={hostById}
            hosts={hosts}
          />
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
      <div className="border-t border-graphite px-3 py-1.5 text-[10.5px] text-fog/60">
        <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">
          ↑↓
        </kbd>{" "}
        to browse ·{" "}
        <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">
          ⏎
        </kbd>{" "}
        to pick ·{" "}
        <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">
          Esc
        </kbd>{" "}
        to dismiss
      </div>
    </>
  );
}

function MentionItems({
  items,
  query,
  hostById,
  hosts,
}: {
  items: readonly Unstable_TriggerItem[];
  query: string;
  hostById: Map<string, Host>;
  hosts: Host[];
}) {
  if (items.length === 0) {
    return (
      <p className="px-2.5 py-3 text-center text-[12px] text-fog">
        No servers or groups match “{query.trim()}”.
      </p>
    );
  }

  const groupItems = items.filter((item) => item.type === "group");
  const hostItems = items.filter((item) => item.type === "host");
  return (
    <>
      {groupItems.length > 0 ? (
        <>
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/60">
            Groups
          </div>
          {groupItems.map((item) => (
            <MentionRow
              key={item.id}
              item={item}
              meta={`${hosts.filter((host) => host.groupId === item.id).length} hosts · expands to group`}
              host={undefined}
            />
          ))}
        </>
      ) : null}
      {hostItems.length > 0 ? (
        <>
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/60">
            Servers
          </div>
          {hostItems.map((item) => (
            <MentionRow
              key={item.id}
              item={item}
              meta={hostById.get(item.id)?.address ?? item.id}
              host={hostById.get(item.id)}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function MentionRow({
  item,
  meta,
  host,
}: {
  item: Unstable_TriggerItem;
  meta: string;
  host?: Host;
}) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItem
      item={item}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5 data-[highlighted]:bg-white/5"
    >
      <span
        className={
          "grid h-7 w-7 shrink-0 place-items-center rounded-md bg-graphite/70 " +
          (item.type === "group" ? "text-signal-teal" : "text-mist")
        }
      >
        {item.type === "group" ? (
          <Folder size={14} />
        ) : (
          <Server size={14} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-paper">
          {item.label}
        </span>
        <span className="block truncate text-[11px] text-fog">{meta}</span>
      </span>
      {host ? (
        <span
          className={
            "h-1.5 w-1.5 shrink-0 rounded-full " +
            (host.status === "online" ? "bg-pulse-green" : "bg-fog/45")
          }
        />
      ) : null}
    </ComposerPrimitive.Unstable_TriggerPopoverItem>
  );
}
