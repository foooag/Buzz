// ai.jsx — AI-mode UI: MessageStream (+ user/assistant/command messages),
// Composer (bottom bar), and ConfirmDialog (high-risk confirmation modal).
// All presentational; state + callbacks come from app.jsx via props.
// Exported to `window`.

const { useEffect, useRef, useState } = React;
const { Icon, SESSION, PROVIDER, lineTokens, formatDuration } = window;

/* ----------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

function Avatar({ tone = "neutral", label }) {
  const base = "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold";
  if (tone === "ai")
    return (
      <div className={`${base} bg-acid-lime/12 text-acid-lime`}>
        <Icon name="sparkles" size={13} />
      </div>
    );
  return <div className={`${base} bg-graphite text-mist`}>{label ?? "U"}</div>;
}

function OutLine({ line }) {
  const tokens = lineTokens(line);
  return (
    <div className="whitespace-pre-wrap break-words">
      {tokens.map((tok, i) => (
        <span key={i} className={tok[1] || undefined}>
          {tok[0]}
        </span>
      ))}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">
      {children}
    </kbd>
  );
}

/* ----------------------------------------------------------------------------
 * Command card
 * ------------------------------------------------------------------------- */

function VerdictChip({ verdict }) {
  if (verdict.allow) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[11px] font-medium text-pulse-green">
        <span className="h-1.5 w-1.5 rounded-full bg-pulse-green" />
        auto-run
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-coral-red/12 px-2 py-0.5 text-[11px] font-medium text-coral-red">
      <Icon name="alert" size={12} />
      high risk
    </span>
  );
}

function StatusBadge({ status, result }) {
  if (status === "pending")
    return <span className="text-[11px] text-fog">queued</span>;
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-mist">
        <span className="spin h-3 w-3 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
        running
      </span>
    );
  if (status === "declined")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        declined
      </span>
    );
  if (status === "aborted")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        aborted
      </span>
    );
  // done
  const ok = result && result.exitCode === 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium " +
        (ok ? "bg-pulse-green/12 text-pulse-green" : "bg-coral-red/12 text-coral-red")
      }
    >
      <Icon name={ok ? "check" : "x"} size={12} />
      exit {result.exitCode}
    </span>
  );
}

function CommandCard({ card, onToggleExpand }) {
  const { cmd, status, verdict, result, excerpt, expanded, target } = card;
  const hasOutput = status === "done" || status === "declined";
  const fullLines = result ? result.full : [];
  const showExpand = fullLines.length > excerpt;
  const visible = expanded ? fullLines : fullLines.slice(0, excerpt);

  return (
    <div className="rise-in overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <VerdictChip verdict={verdict} />
        <StatusBadge status={status} result={result} />
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-start gap-2 font-mono text-[12.5px] leading-relaxed text-mist">
          <span className="select-none text-fog">$</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{cmd}</span>
        </div>
      </div>

      {status === "running" ? (
        <div className="mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-fog">
          <span className="c-dim">capturing output…</span>
        </div>
      ) : hasOutput && fullLines.length > 0 ? (
        <div className="mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed text-mist/90">
          {visible.map((line, i) => (
            <OutLine key={i} line={line} />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-graphite/70 px-3 py-1.5 text-[11px] text-fog">
        <div className="flex items-center gap-2">
          {result && status === "done" ? (
            <span>{formatDuration(result.durationMs)}</span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Icon name="server" size={11} />
            {target ?? SESSION.host}
          </span>
        </div>
        {showExpand ? (
          <button
            type="button"
            onClick={() => onToggleExpand(card.id)}
            className="inline-flex items-center gap-1 rounded text-fog transition-colors hover:text-mist"
          >
            <Icon name="chevron-down" size={12} className={expanded ? "rotate-180" : ""} />
            {expanded ? "Show less" : `Expand full output (${fullLines.length - excerpt} more)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Messages
 * ------------------------------------------------------------------------- */

function MessageView({ message, onToggleExpand }) {
  if (message.role === "user") {
    return (
      <div className="rise-in flex gap-2.5">
        <Avatar label="U" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-fog">You</div>
          <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            {message.text}
          </div>
        </div>
      </div>
    );
  }
  if (message.role === "assistant") {
    return (
      <div className="rise-in flex gap-2.5">
        <Avatar tone="ai" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-acid-lime/90">Assistant</div>
          <div
            className={
              "mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist " +
              (message.streaming ? "stream-caret" : "")
            }
          >
            {message.text}
          </div>
        </div>
      </div>
    );
  }
  // tool / command card
  return <CommandCard card={message} onToggleExpand={onToggleExpand} />;
}

function MessageStream({ messages, onToggleExpand, layout = "bottom" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const sidebar = layout === "sidebar";
  return (
    <div
      ref={ref}
      className={
        "scroll-thin min-h-0 overflow-y-auto bg-carbon/60 px-4 py-3 " +
        (sidebar ? "flex-1" : "max-h-[min(40vh,360px)] border-t border-graphite")
      }
    >
      <div className="flex flex-col gap-3.5">{messages.map((m) => (
        <MessageView key={m.id} message={m} onToggleExpand={onToggleExpand} />
      ))}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Composer
 * ------------------------------------------------------------------------- */

function Composer({
  inputRef,
  input,
  setInput,
  onSend,
  onAbort,
  busy,
  awaitingConfirm,
  layout = "bottom",
}) {
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 128) + "px";
  }, [input, inputRef]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && input.trim()) onSend();
    }
  };

  const canSend = !busy && !awaitingConfirm && input.trim().length > 0;
  const sidebar = layout === "sidebar";

  if (sidebar) {
    return (
      <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-3 pt-3">
        <div className="rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
          <textarea
            ref={inputRef}
            rows={3}
            value={input}
            placeholder={`Describe what you want done on ${SESSION.host}…`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="scroll-thin max-h-32 min-h-[76px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-mist outline-none placeholder:text-fog/70"
          />
          <div className="flex items-center justify-between gap-2 border-t border-graphite/80 px-2.5 py-2">
            <span
              title="Secrets are scrubbed before leaving your machine (best-effort regex redaction)."
              className="inline-flex items-center gap-1.5 text-[10.5px] text-fog"
            >
              <Icon name="shield" size={12} />
              Cloud · scrubbed
            </span>
            {busy ? (
              <button
                type="button"
                onClick={onAbort}
                title="Abort (Esc)"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-coral-red/45 px-2.5 text-[11px] font-medium text-coral-red transition-colors hover:bg-coral-red/12"
              >
                <Icon name="stop" size={13} />
                Abort
              </button>
            ) : (
              <button
                type="button"
                onClick={() => canSend && onSend()}
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
                <Icon name="send" size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-[10.5px] text-fog">
          <span className="min-w-0 truncate">
            <span className="text-mist">{PROVIDER.name}</span>
            <span className="px-1 text-fog/50">·</span>
            {PROVIDER.model}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Kbd>{busy ? "Esc" : "⏎"}</Kbd>
            <span>{busy ? "abort" : "send"}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-2">
      <div className="flex items-end gap-2.5 rounded-lg border border-graphite bg-obsidian/70 px-2.5 py-2 transition-colors focus-within:border-smoke">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-acid-lime/12 text-acid-lime">
          <Icon name="sparkles" size={16} />
        </div>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          placeholder={`Describe what you want done on ${SESSION.host}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="scroll-thin max-h-32 flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed text-mist outline-none placeholder:text-fog/70"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            title="Secrets are scrubbed before leaving your machine (best-effort regex redaction)."
            className="hidden items-center gap-1 rounded-pill bg-graphite/70 px-2 py-1 text-[11px] text-fog sm:inline-flex"
          >
            <Icon name="shield" size={12} />
            Cloud · scrubbed
          </span>
          {busy ? (
            <button
              type="button"
              onClick={onAbort}
              title="Abort (Esc)"
              aria-label="Abort"
              className="grid h-7 w-7 place-items-center rounded-md border border-coral-red/45 text-coral-red transition-colors hover:bg-coral-red/12"
            >
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => canSend && onSend()}
              disabled={!canSend}
              aria-label="Send"
              title="Send (⏎)"
              className={
                "grid h-7 w-7 place-items-center rounded-md transition-colors " +
                (canSend
                  ? "bg-acid-lime text-void hover:brightness-105"
                  : "bg-graphite text-fog")
              }
            >
              <Icon name="send" size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-fog">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-mist">{PROVIDER.name}</span>
          <span className="text-fog/70">·</span>
          <span>{PROVIDER.model}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {busy ? (
            <>
              <Kbd>Esc</Kbd>
              <span>abort</span>
            </>
          ) : (
            <>
              <Kbd>⏎</Kbd>
              <span>send</span>
              <span className="text-fog/40">·</span>
              <Kbd>⇧⏎</Kbd>
              <span>newline</span>
              <span className="text-fog/40">·</span>
              <Kbd>⌘I</Kbd>
              <span>toggle</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * History panel — past conversations on this host
 * ------------------------------------------------------------------------- */

function formatHistoryWhen(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const hhmm = hh + ":" + mm;
  if (sameDay) return hhmm;
  if (isYesterday) return "Yesterday " + hhmm;
  const mmdd = String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  return mmdd + " " + hhmm;
}

function historyStatusOf(conv) {
  const toolRunning = conv.messages.some(
    (m) => m.role === "tool" && (m.status === "running" || m.status === "pending"),
  );
  if (toolRunning) return { label: "Interrupted", cls: "text-yellow-400", dot: "bg-yellow-400" };
  const lastTool = [...conv.messages].reverse().find((m) => m.role === "tool");
  if (lastTool && lastTool.status === "declined")
    return { label: "Declined", cls: "text-yellow-400", dot: "bg-yellow-400" };
  if (lastTool && lastTool.status === "aborted")
    return { label: "Aborted", cls: "text-yellow-400", dot: "bg-yellow-400" };
  if (lastTool && lastTool.status === "done" && lastTool.result && lastTool.result.exitCode !== 0)
    return { label: "Exit " + lastTool.result.exitCode, cls: "text-coral-red", dot: "bg-coral-red" };
  return { label: "Done", cls: "text-pulse-green", dot: "bg-pulse-green" };
}

function AiHistoryRow({ conv, active, onOpen, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const status = historyStatusOf(conv);
  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== conv.title) onRename(conv.id, t);
    setEditing(false);
  };
  return (
    <div
      data-active={active || undefined}
      className={
        "group relative cursor-pointer rounded-lg border px-3 py-2.5 transition-colors " +
        (active
          ? "border-acid-lime/50 bg-graphite/50"
          : "border-graphite/70 bg-obsidian/30 hover:border-smoke hover:bg-obsidian/60")
      }
      onClick={() => !editing && onOpen(conv.id)}
    >
      <div className="flex items-start gap-2">
        <span className={"mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " + status.dot} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                if (e.key === "Escape") { e.preventDefault(); setDraft(conv.title); setEditing(false); }
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-smoke bg-carbon px-1.5 py-0.5 text-[12.5px] text-mist outline-none"
            />
          ) : (
            <div className="truncate text-[12.5px] font-medium leading-snug text-mist">
              {conv.title}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-fog">
            <span>{formatHistoryWhen(conv.updatedAt)}</span>
            <span className="text-fog/40">·</span>
            <span>{conv.messages.length} msg</span>
            <span className="text-fog/40">·</span>
            <span className={status.cls}>{status.label}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label="Rename conversation"
            title="Rename"
            onClick={(e) => { e.stopPropagation(); setDraft(conv.title); setEditing(true); }}
            className="grid h-6 w-6 place-items-center rounded text-fog hover:bg-white/10 hover:text-mist"
          >
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            aria-label="Delete conversation"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
            className="grid h-6 w-6 place-items-center rounded text-fog hover:bg-coral-red/12 hover:text-coral-red"
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ conversations, activeId, onOpen, onDelete, onRename, onNewChat, onClose }) {
  const [query, setQuery] = useState("");
  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return c.title.toLowerCase().includes(q);
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-carbon">
      <div className="flex shrink-0 items-center gap-2 border-b border-graphite px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-graphite bg-obsidian/60 px-2.5 py-1.5 transition-colors focus-within:border-smoke">
          <Icon name="search" size={13} className="shrink-0 text-fog" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
            placeholder="Search past chats"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-mist outline-none placeholder:text-fog/60"
          />
        </div>
        <button
          type="button"
          onClick={onNewChat}
          title="New chat"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-acid-lime px-2.5 text-[11.5px] font-semibold text-void transition hover:brightness-105"
        >
          <Icon name="plus" size={13} />
          New
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-graphite bg-obsidian/60 text-fog">
              <Icon name="history" size={18} />
            </span>
            <h4 className="m-0 mt-3 text-[13px] font-medium text-mist">
              {conversations.length === 0 ? "No past chats" : "No matches"}
            </h4>
            <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-fog">
              {conversations.length === 0
                ? "Conversations on this host are saved automatically."
                : "Try a different search."}
            </p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            {filtered.map((c) => (
              <AiHistoryRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onOpen={onOpen}
                onDelete={onDelete}
                onRename={onRename}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Confirm dialog (high-risk command)
 * ------------------------------------------------------------------------- */
function ConfirmDialog({ card, onResolve }) {
  const [cmdDraft, setCmdDraft] = useState(card.cmd);
  const edited = cmdDraft.trim() !== card.cmd.trim();

  const handleKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onResolve("cancel");
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onResolve("run", cmdDraft.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={() => onResolve("cancel")}
    >
      <div
        className="pop-in w-[min(560px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
            <Icon name="alert" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">
                Confirm high-risk command
              </h2>
              <span className="rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
                high
              </span>
            </div>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Icon name="server" size={12} />
              On {SESSION.host} via SSH · the agent is asking permission to proceed.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              Command
            </label>
            <div className="flex items-start gap-2 rounded-md border border-smoke bg-black/50 px-2.5 py-2 font-mono text-[12.5px] text-mist focus-within:border-coral-red/50">
              <span className="select-none text-coral-red/80">$</span>
              <input
                autoFocus
                value={cmdDraft}
                onChange={(e) => setCmdDraft(e.target.value)}
                onKeyDown={handleKey}
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-mist outline-none"
              />
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-fog/80">
              Editable — change it before approving if needed.
            </p>
          </div>

          <Field label="Why this is risky" icon="alert" tone="coral">
            {card.verdict.reason}
          </Field>
          <Field label="What will happen" icon="chevron-right" tone="neutral">
            {card.verdict.projectedEffect}
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onResolve("cancel")}
            className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <Kbd>⌘⏎</Kbd> run · <Kbd>Esc</Kbd> cancel
            </span>
            <button
              type="button"
              onClick={() => onResolve("run", cmdDraft.trim())}
              className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              {edited ? "Run edited command" : "Run command"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, tone, children }) {
  const tint = tone === "coral" ? "text-coral-red" : "text-fog";
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] ${tint}`}>
        <Icon name={icon} size={12} />
        {label}
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-mist">{children}</p>
    </div>
  );
}

Object.assign(window, {
  MessageStream,
  Composer,
  ConfirmDialog,
  HistoryPanel,
});
