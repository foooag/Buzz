import { useEffect, useRef, useState } from "react";
import {
  Folder,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import type { Host } from "@/shared/types";
import type { AgentMentionItem } from "../agentTypes";
import { buildMentionItems, useMentionSources } from "./mentionAdapter";

type MentionComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
  onAbort?: () => void;
  busy: boolean;
  awaitingConfirm: boolean;
  providerLabel?: string;
};

export function MentionComposer({
  input,
  onInputChange,
  onSend,
  onAbort,
  busy,
  awaitingConfirm,
  providerLabel,
}: MentionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ textBefore: string } | null>(null);
  const [query, setQuery] = useState("");
  const { hosts, groups } = useMentionSources();
  const hostById = new Map(hosts.map((host) => [host.id, host]));

  const canSend = !busy && !awaitingConfirm && input.trim().length > 0;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [input]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    onInputChange(value);
    const caret = event.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([^\s@]*)$/);
    if (match) {
      setMention({ textBefore: match[0] });
      setQuery(match[1]);
    } else {
      setMention(null);
      setQuery("");
    }
  };

  const insertMention = (target: AgentMentionItem) => {
    if (!mention) return;
    const directive =
      target.type === "group"
        ? `:group[${target.label}]{name=${target.id}}`
        : `:host[${target.label}]{name=${target.id}}`;
    const caret = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    const stripped = before.replace(/@[^\s@]*$/, "");
    const needsGap = stripped.length > 0 && !/\s$/.test(stripped);
    const next =
      stripped +
      (needsGap ? " " : "") +
      directive +
      (after.length > 0 && !/^\s/.test(after) ? " " : "") +
      after;
    onInputChange(next);
    setMention(null);
    setQuery("");
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(next.length, next.length);
      }
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      event.preventDefault();
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      if (canSend) onSend(input);
    }
  };

  return (
    <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
      <div className="relative">
        {mention ? (
          <MentionPicker
            query={query}
            hostById={hostById}
            onPick={insertMention}
            onClose={() => setMention(null)}
          />
        ) : null}
        <div className="rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
          <textarea
            ref={textareaRef}
            rows={3}
            aria-label="Message agent"
            value={input}
            placeholder="@ 选择服务器或分组，描述要执行的运维操作…"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
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
              <button
                type="button"
                onClick={() => canSend && onSend(input)}
                disabled={!canSend}
                title="Send (⏎)"
                className={
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors " +
                  (canSend
                    ? "bg-acid-lime text-void hover:brightness-105"
                    : "bg-graphite text-fog")
                }
              >
                <span>Send</span>
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
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
  );
}

function MentionPicker({
  query,
  hostById,
  onPick,
  onClose,
}: {
  query: string;
  hostById: Map<string, Host>;
  onPick: (item: AgentMentionItem) => void;
  onClose: () => void;
}) {
  const { hosts, groups } = useMentionSources();
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const categories = buildMentionItems(hosts, groups, query).filter(
    (category) => category.items.length > 0,
  );
  const flat = categories.flatMap((category) =>
    category.items.map((item) => ({ category, item })),
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!ref.current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!flat.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % flat.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (current) => (current - 1 + flat.length) % flat.length,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        onPick(flat[activeIndex].item);
      }
    };
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [activeIndex, flat, onClose, onPick]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Mention a server or group"
      className="pop-in absolute bottom-[calc(100%+6px)] left-0 z-30 w-[min(320px,calc(100%-8px))] overflow-hidden rounded-xl border border-graphite bg-carbon shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
    >
      <div className="flex items-center gap-1.5 border-b border-graphite px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">
        <Sparkles size={11} className="text-acid-lime" />
        Mention target
      </div>

      <div className="scroll-thin max-h-[264px] overflow-y-auto p-1.5">
        {flat.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-[12px] text-fog">
            No servers or groups match “{query.trim()}”.
          </p>
        ) : (
          categories.map((category) => (
            <div key={category.id}>
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/60">
                {category.label}
              </div>
              {category.items.map((item, offset) => {
                const index = flat.findIndex(
                  (entry) => entry.item.id === item.id && entry.category.id === category.id,
                );
                return (
                  <MentionRow
                    key={`${category.id}-${item.id}`}
                    item={item}
                    host={item.type === "host" ? hostById.get(item.id) : undefined}
                    active={index === activeIndex}
                    onPick={() => onPick(item)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
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
    </div>
  );
}

function MentionRow({
  item,
  host,
  active,
  onPick,
}: {
  item: AgentMentionItem;
  host?: Host;
  active: boolean;
  onPick: () => void;
}) {
  const { hosts } = useMentionSources();
  const meta =
    item.type === "group"
      ? `${hosts.filter((candidate) => candidate.groupId === item.id).length} hosts · expands to group`
      : host?.address ?? item.id;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      className={
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors " +
        (active ? "bg-white/5" : "hover:bg-white/5")
      }
    >
      <span
        className={
          "grid h-7 w-7 shrink-0 place-items-center rounded-md bg-graphite/70 " +
          (item.type === "group" ? "text-signal-teal" : "text-mist")
        }
      >
        {item.type === "group" ? <Folder size={14} /> : <Server size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-paper">{item.label}</span>
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
    </button>
  );
}
