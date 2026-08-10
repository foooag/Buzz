import { useEffect, useRef } from "react";
import { Send, ShieldCheck, Square } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MentionPopover } from "./mention/MentionPopover";
import { serializeDirective } from "./mention/directiveFormat";
import { useMentionTrigger } from "./mention/useMentionTrigger";
import type { Group, Host } from "@/shared/types";

export type MentionComposerProps = {
  value: string;
  onValueChange: (text: string) => void;
  onSend: () => void;
  onAbort: () => void;
  busy: boolean;
  awaitingConfirm: boolean;
  disabled?: boolean;
  sendDisabled?: boolean;
  providerLabel?: string;
  draftNonce?: number;
  hosts: Host[];
  groups: Group[];
  mentionEnabled: boolean;
};

export function MentionComposer({
  value, onValueChange, onSend, onAbort, busy, awaitingConfirm, disabled, sendDisabled, providerLabel, draftNonce, hosts, groups, mentionEnabled,
}: MentionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const appliedDraftNonce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (draftNonce === undefined || appliedDraftNonce.current === draftNonce) return;
    appliedDraftNonce.current = draftNonce;
    if (textareaRef.current) textareaRef.current.value = value;
  }, [draftNonce, value]);

  const trigger = useMentionTrigger(textareaRef, () => undefined);

  const insertDirective = (serialized: string) => {
    const ta = textareaRef.current;
    if (!ta) { onValueChange(value + serialized); return; }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    // Replace the "@query" token (the @ and the typed query) with the directive.
    const tokenStart = Math.max(0, start - (trigger.query.length + 1));
    const next = value.slice(0, tokenStart) + serialized + value.slice(end);
    onValueChange(next);
    trigger.close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && busy) { event.preventDefault(); onAbort(); return; }
    if (event.key === "Enter" && !event.shiftKey && !trigger.open) {
      event.preventDefault();
      if (!busy && !awaitingConfirm && !disabled && !sendDisabled) onSend();
    }
  };

  return (
    <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
      <div className="relative">
        <MentionPopover
          open={trigger.open}
          query={trigger.query}
          hosts={hosts}
          groups={groups}
          enabled={mentionEnabled}
          onSelect={(item) => insertDirective(serializeDirective(item))}
          onClose={trigger.close}
        />
        <Textarea
          ref={textareaRef}
          aria-label="Message agent"
          value={value}
          disabled={disabled || awaitingConfirm}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="@ 选择服务器或分组，描述要执行的运维操作…"
          className="scroll-thin max-h-32 min-h-[76px] w-full resize-none border-graphite bg-obsidian/70 px-3 py-2.5 pr-9 text-[13px] leading-relaxed text-mist outline-none focus-visible:border-smoke focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
          <span title="Secrets are scrubbed before leaving your machine (best-effort regex redaction)." className="inline-flex items-center gap-1.5 text-[10.5px] text-fog">
            <ShieldCheck size={12} /> Cloud · scrubbed
          </span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-[10.5px]">
              {providerLabel ? <span className="text-mist">{providerLabel}</span> : <span className="text-fog/70">No provider configured</span>}
            </span>
            {busy ? (
              <button type="button" onClick={onAbort} title="Abort (Esc)" className="inline-flex h-7 items-center gap-1.5 rounded-md border border-coral-red/45 px-2.5 text-[11px] font-medium text-coral-red transition-colors hover:bg-coral-red/12">
                <Square size={13} /> Abort
              </button>
            ) : (
              <button type="button" aria-label="Send" onClick={onSend} disabled={disabled || awaitingConfirm || sendDisabled} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors disabled:bg-graphite disabled:text-fog enabled:bg-acid-lime enabled:text-void enabled:hover:brightness-105">
                <span>Send</span><Send size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 px-0.5 text-[10.5px] text-fog">
          <span />
          <span className="flex shrink-0 items-center gap-1">
            <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">@</kbd>
            <span>mention</span>
            <span className="text-fog/40">·</span>
            <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">{busy ? "Esc" : "⏎"}</kbd>
            <span>{busy ? "abort" : "send"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
