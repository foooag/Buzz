// agent.jsx — AgentView: the left-sidebar multi-host ops Agent (PRD
//   docs/prd/2026-08-05-agent-sidebar.md). An interactive prototype:
//     • @-mention picker (Servers / Groups from INV) inserting a `:host[…]` directive
//     • scripted agent turns that drive a per-host progress rail on the right
//     • high-risk command confirm card (approve / deny)
//     • credential-missing + host-key banners
//   Two demo scenarios (a "Scenario" select toggles between them):
//     docker  — "把 @web-prod-01 上的容器同样运行在 @web-prod-02 上" (cross-host sync)
//     fleet   — "@Production 逐台健康检查" (group batch + risk + credential gaps)
//   No auto-mount; shell.jsx renders <AgentView/> for the "agent" destination.
// Exported to `window`.

const { useEffect, useRef, useState, useCallback } = React;
const { Icon, INV, lineTokens, formatDuration, nextId } = window;

const SCENARIOS = {
  docker: {
    id: "docker",
    label: "Docker sync",
    request: "把 @web-prod-01 上的容器同样运行在 @web-prod-02 上",
    desc: "Cross-host container sync",
    preview: "docker ps → inspect → pull → run",
  },
  fleet: {
    id: "fleet",
    label: "Fleet health",
    request: "@Production 逐台健康检查",
    desc: "Group batch · risk + gaps",
    preview: "uptime → df → risk confirm · cred missing",
  },
};

const DOCKER_TIMELINE = [
  {
    kind: "assistant",
    text: "On it. I'll read the container definition on web-prod-01, then replicate the same container on web-prod-02.",
  },
  { kind: "headless", hostId: "h-web-prod-01", hostLabel: "web-prod-01" },
  {
    kind: "exec",
    hostId: "h-web-prod-01",
    hostLabel: "web-prod-01",
    cmd: "docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Status}}'",
    verdict: { allow: true },
    durationMs: 420,
    exitCode: 0,
    excerpt: 4,
    full: [
      [["CONTAINER ID   IMAGE             COMMAND                  CREATED      STATUS", "c-dim"]],
      [["e6f2a1c9b0d4   shop/app:1.4.2    \"/entrypoint.sh serve\"   3 days ago   Up 3 days (healthy)", ""]],
    ],
  },
  {
    kind: "exec",
    hostId: "h-web-prod-01",
    hostLabel: "web-prod-01",
    cmd: "docker inspect e6f2a1c9b0d4 --format '{{json .Config}}'",
    verdict: { allow: true },
    durationMs: 360,
    exitCode: 0,
    excerpt: 5,
    full: [
      [["{", ""]],
      [["  \"Image\": \"shop/app:1.4.2\",", "c-cyan"]],
      [["  \"Env\": [\"NODE_ENV=production\",\"SHOP_ENV=prod\"],", "c-cyan"]],
      [["  \"ExposedPorts\": {\"8080/tcp\": {}}", "c-cyan"]],
      [["}", ""]],
    ],
  },
  {
    kind: "assistant",
    text: "Got it — image `shop/app:1.4.2`, port 8080, `NODE_ENV=production`. Now on web-prod-02: pull the image, then run the identical container.",
  },
  { kind: "headless", hostId: "h-web-prod-02", hostLabel: "web-prod-02" },
  {
    kind: "exec",
    hostId: "h-web-prod-02",
    hostLabel: "web-prod-02",
    cmd: "docker pull shop/app:1.4.2",
    verdict: { allow: true },
    durationMs: 900,
    exitCode: 0,
    excerpt: 3,
    full: [
      [["1.4.2: Pulling from shop/app", "c-dim"]],
      [["Digest: sha256:9f2a…d31e", "c-dim"]],
      [["Status: Downloaded newer image for shop/app:1.4.2", "c-green"]],
    ],
  },
  {
    kind: "exec",
    hostId: "h-web-prod-02",
    hostLabel: "web-prod-02",
    cmd: "docker run -d --name shop -p 8080:8080 -e NODE_ENV=production shop/app:1.4.2",
    verdict: {
      allow: false,
      level: "high",
      reason: "Runs a new container on a production host — starts the shop service on port 8080.",
      projectedEffect:
        "Starts `shop` (shop/app:1.4.2) on web-prod-02 at 0.0.0.0:8080. The service will begin serving traffic immediately; rollback = `docker stop shop && docker rm shop`.",
    },
    durationMs: 1700,
    exitCode: 0,
    excerpt: 1,
    full: [[["e6f2a1c9b0d4…", "c-dim"]]],
  },
  {
    kind: "exec",
    hostId: "h-web-prod-02",
    hostLabel: "web-prod-02",
    cmd: "docker ps --filter name=shop --format '{{.Names}}  {{.Status}}'",
    verdict: { allow: true },
    durationMs: 260,
    exitCode: 0,
    excerpt: 1,
    full: [[["shop  Up Less than a second (healthy)", "c-green"]]],
  },
  {
    kind: "assistant",
    text: "Done. The `shop` container (shop/app:1.4.2, port 8080) is now running on both hosts. web-prod-02 is healthy and serving. Both were configured identically — NODE_ENV=production, same image tag.",
  },
];

const FLEET_TIMELINE = [
  {
    kind: "assistant",
    text: "Running a quick health check across the Production group — 4 hosts. I'll ask before anything destructive.",
  },
  { kind: "headless", hostId: "h-web-prod-01", hostLabel: "web-prod-01" },
  { kind: "headless", hostId: "h-web-prod-02", hostLabel: "web-prod-02" },
  { kind: "headless", hostId: "h-jump-bastion", hostLabel: "bastion-jump" },
  {
    kind: "exec",
    hostId: "h-web-prod-01",
    hostLabel: "web-prod-01",
    cmd: "uptime && df -h / | tail -n 1",
    verdict: { allow: true },
    durationMs: 340,
    exitCode: 0,
    excerpt: 3,
    full: [
      [[" 09:42:03 up 14 days, 3:47, 1 user, load average: 0.18, 0.22, 0.19", "c-green"]],
      [["/dev/vda1   39G   18G   19G  49%  /", ""]],
    ],
  },
  {
    kind: "exec",
    hostId: "h-web-prod-02",
    hostLabel: "web-prod-02",
    cmd: "uptime && df -h / | tail -n 1",
    verdict: { allow: true },
    durationMs: 320,
    exitCode: 0,
    excerpt: 3,
    full: [
      [[" 09:42:04 up 14 days, 3:46, 1 user, load average: 0.32, 0.28, 0.24", "c-green"]],
      [["/dev/vda1   39G   17G   20G  47%  /", ""]],
    ],
  },
  {
    kind: "exec",
    hostId: "h-api-prod-01",
    hostLabel: "api-prod-01",
    cmd: "uptime && df -h / | tail -n 1",
    verdict: { allow: true },
    durationMs: 260,
    exitCode: 0,
    excerpt: 2,
    full: [
      [["Connection refused — no saved credential for api-prod-01. Skipping.", "c-red"]],
    ],
    credentialMissing: true,
  },
  {
    kind: "exec",
    hostId: "h-jump-bastion",
    hostLabel: "bastion-jump",
    cmd: "tail -n 20 /var/log/bastion/conn.log",
    verdict: {
      allow: false,
      level: "high",
      reason: "Reads a log file that may contain connection metadata from other teams.",
      projectedEffect: "Shows the last 20 lines of /var/log/bastion/conn.log on bastion-jump. No changes are made.",
    },
    durationMs: 900,
    exitCode: 0,
    excerpt: 2,
    full: [[[" 08:58:11 bridge  203.0.113.42 → db-primary  ok", "c-dim"]], [[" 08:58:12 bridge  203.0.113.43 → web-prod-01  ok", "c-dim"]]],
  },
  {
    kind: "assistant",
    text: "Summary — Production: web-prod-01 ✓ (load 0.18, 49% disk), web-prod-02 ✓ (load 0.32, 47% disk), api-prod-01 skipped (no saved credential — connect once from Servers to let me in), bastion-jump ✓ after your approval. Nothing else needs attention.",
  },
];

const HOSTS_BY_ID = Object.fromEntries(INV.HOSTS.map((h) => [h.id, h]));
const GROUPS_BY_ID = Object.fromEntries(INV.GROUPS.map((g) => [g.id, g]));
const GROUP_HOSTS = (groupId) =>
  INV.HOSTS.filter((h) => h.group === groupId).map((h) => h.id);

function hostName(id) {
  const h = HOSTS_BY_ID[id];
  return h ? h.name : id;
}
function groupName(id) {
  const g = GROUPS_BY_ID[id];
  return g ? g.name : id;
}

/* ----------------------------------------------------------------------------
 * @-mention picker
 * ------------------------------------------------------------------------- */

function MentionPicker({ query, open, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const hostHits = INV.HOSTS.filter(
    (h) => !q || h.name.toLowerCase().includes(q) || h.address.includes(q),
  );
  const groupHits = INV.GROUPS.filter((g) => !q || g.name.toLowerCase().includes(q));
  const none = hostHits.length + groupHits.length === 0;

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Mention a server or group"
      className="pop-in absolute bottom-[calc(100%+6px)] left-0 z-30 w-[min(320px,calc(100%-8px))] overflow-hidden rounded-xl border border-graphite bg-carbon shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
    >
      <div className="flex items-center gap-1.5 border-b border-graphite px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">
        <Icon name="sparkles" size={11} className="text-acid-lime" />
        Mention target
      </div>

      <div className="scroll-thin max-h-[264px] overflow-y-auto p-1.5">
        {none ? (
          <p className="px-2.5 py-3 text-center text-[12px] text-fog">No servers or groups match “{query.trim()}”.</p>
        ) : (
          <>
            {groupHits.length > 0 ? (
              <>
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/60">
                  Groups
                </div>
                {groupHits.map((g) => (
                  <MentionRow
                    key={g.id}
                    icon="folder"
                    tone="text-signal-teal"
                    label={g.name}
                    meta={`${g.count} hosts · expands to group`}
                    onPick={() => onPick({ type: "group", id: g.id, label: g.name })}
                  />
                ))}
              </>
            ) : null}

            {hostHits.length > 0 ? (
              <>
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/60">
                  Servers
                </div>
                {hostHits.map((h) => (
                  <MentionRow
                    key={h.id}
                    icon="server"
                    tone="text-mist"
                    label={h.name}
                    meta={h.address}
                    status={h.status}
                    onPick={() => onPick({ type: "host", id: h.id, label: h.name })}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="border-t border-graphite px-3 py-1.5 text-[10.5px] text-fog/60">
        <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">↑↓</kbd>{" "}
        to browse · <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">⏎</kbd>{" "}
        to pick · <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[9.5px]">Esc</kbd>{" "}
        to dismiss
      </div>
    </div>
  );
}

function MentionRow({ icon, tone, label, meta, status, onPick }) {
  return (
    <button
      type="button"
      role="option"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5"
    >
      <span className={"grid h-7 w-7 shrink-0 place-items-center rounded-md bg-graphite/70 " + tone}>
        <Icon name={icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-paper">{label}</span>
        <span className="block truncate text-[11px] text-fog">{meta}</span>
      </span>
      {status ? (
        <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (status === "online" ? "bg-pulse-green" : "bg-fog/45")} />
      ) : null}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Agent composer (textarea + @-mention picker)
 * ------------------------------------------------------------------------- */

function AgentComposer({ input, setInput, onSend, busy, awaitingConfirm }) {
  const ref = useRef(null);
  const [mention, setMention] = useState(null); // { textBefore } | null
  const [query, setQuery] = useState("");

  const canSend = !busy && !awaitingConfirm && input.trim().length > 0;

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 128) + "px";
  }, [input]);

  const handleChange = (e) => {
    const value = e.target.value;
    setInput(value);
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(/@([^\s@]*)$/);
    if (m) {
      setMention({ textBefore: m[0] });
      setQuery(m[1]);
    } else {
      setMention(null);
      setQuery("");
    }
  };

  const insertMention = (target) => {
    if (!mention) return;
    const directive =
      target.type === "group"
        ? `:group[${target.label}]{name=${target.id}}`
        : `:host[${target.label}]{name=${target.id}}`;
    const caret = ref.current?.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    const stripped = before.replace(/@[^\s@]*$/, "");
    const needsGap = stripped.length > 0 && !/\s$/.test(stripped);
    const next = stripped + (needsGap ? " " : "") + directive + (after.length > 0 && !/^\s/.test(after) ? " " : "") + after;
    setInput(next);
    setMention(null);
    setQuery("");
    setTimeout(() => {
      const ta = ref.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(next.length, next.length);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy && input.trim()) onSend();
    }
  };

  return (
    <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
      <div className="relative">
        {mention ? (
          <MentionPicker
            query={query}
            open
            onPick={insertMention}
            onClose={() => setMention(null)}
          />
        ) : null}
        <div className="rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
          <textarea
            ref={ref}
            rows={3}
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
              <Icon name="shield" size={12} />
              Cloud · scrubbed
            </span>
            {busy ? (
              <button
                type="button"
                onClick={onSend}
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
            <span className="text-mist">Claude</span>
            <span className="px-1 text-fog/50">·</span>
            Sonnet 5
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

/* ----------------------------------------------------------------------------
 * Agent chat messages + command cards
 * ------------------------------------------------------------------------- */

function AgentAvatar({ tone, label }) {
  if (tone === "ai") {
    return (
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-acid-lime/12 text-acid-lime">
        <Icon name="sparkles" size={13} />
      </div>
    );
  }
  return (
    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-graphite text-[10px] font-semibold text-mist">
      {label ?? "U"}
    </div>
  );
}

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

function AgentStatusBadge({ status, result }) {
  if (status === "pending") return <span className="text-[11px] text-fog">queued</span>;
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-mist">
        <span className="spin h-3 w-3 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
        running
      </span>
    );
  if (status === "credential-missing")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        <Icon name="alert" size={11} />
        needs credential
      </span>
    );
  if (status === "declined")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        declined
      </span>
    );
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

function AgentCommandCard({ card, onToggleExpand }) {
  const { cmd, status, verdict, result, excerpt, expanded, hostLabel } = card;
  const hasOutput = status === "done" || status === "declined";
  const fullLines = result ? result.full : [];
  const showExpand = fullLines.length > excerpt;
  const visible = expanded ? fullLines : fullLines.slice(0, excerpt);

  return (
    <div className="rise-in overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <VerdictChip verdict={verdict} />
        <AgentStatusBadge status={status} result={result} />
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
            <div key={i} className="whitespace-pre-wrap break-words">
              {lineTokens(line).map((tok, j) => (
                <span key={j} className={tok[1] || undefined}>
                  {tok[0]}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-graphite/70 px-3 py-1.5 text-[11px] text-fog">
        <div className="flex min-w-0 items-center gap-2">
          {result && status === "done" ? (
            <span className="shrink-0">{formatDuration(result.durationMs)}</span>
          ) : null}
          <span className="inline-flex min-w-0 items-center gap-1">
            <Icon name="server" size={11} className="shrink-0" />
            <span className="truncate">{hostLabel}</span>
          </span>
        </div>
        {showExpand ? (
          <button
            type="button"
            onClick={() => onToggleExpand(card.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded text-fog transition-colors hover:text-mist"
          >
            <Icon name="chevron-down" size={12} className={expanded ? "rotate-180" : ""} />
            {expanded ? "Show less" : `Expand (${fullLines.length - excerpt} more)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AgentMessageView({ message, onToggleExpand }) {
  if (message.role === "user") {
    return (
      <div className="rise-in flex gap-2.5">
        <AgentAvatar label="U" />
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
        <AgentAvatar tone="ai" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-acid-lime/90">Agent</div>
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
  return <AgentCommandCard card={message} onToggleExpand={onToggleExpand} />;
}

function AgentMessageStream({ messages, onToggleExpand }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  return (
    <div ref={ref} className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-carbon/60 px-4 py-3">
      <div className="flex flex-col gap-3.5">
        {messages.map((m) => (
          <AgentMessageView key={m.id} message={m} onToggleExpand={onToggleExpand} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Right-side per-host progress rail (F4)
 * ------------------------------------------------------------------------- */

function HostProgressCard({ host, commands, status }) {
  const state = status;
  const stateTone =
    state === "done"
      ? { dot: "bg-pulse-green", label: "done", cls: "text-pulse-green" }
      : state === "error"
        ? { dot: "bg-coral-red", label: "error", cls: "text-coral-red" }
        : state === "connecting"
          ? { dot: "bg-yellow-400", label: "connecting", cls: "text-yellow-400" }
          : { dot: "bg-acid-lime", label: "working", cls: "text-acid-lime" };

  return (
    <div
      className={
        "rounded-lg border bg-carbon p-2.5 transition-colors " +
        (state === "error"
          ? "border-coral-red/40"
          : state === "done"
            ? "border-graphite"
            : "border-acid-lime/25")
      }
    >
      <div className="flex items-center gap-2">
        <span className={"h-2 w-2 shrink-0 rounded-full " + stateTone.dot} />
        <Icon name="server" size={12} className="shrink-0 text-fog" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-paper">
          {host}
        </span>
        <span className={"shrink-0 text-[10.5px] font-medium " + stateTone.cls}>
          {stateTone.label}
        </span>
      </div>

      <div className="mt-2 grid gap-1.5">
        {commands.map((c) => (
          <div
            key={c.id}
            className={
              "rounded-md border px-2 py-1.5 " +
              (c.status === "running"
                ? "border-acid-lime/30 bg-acid-lime/5"
                : c.status === "error"
                  ? "border-coral-red/35 bg-coral-red/5"
                  : "border-graphite/80 bg-black/25")
            }
          >
            <div className="flex items-start gap-1.5">
              {c.status === "running" ? (
                <span className="spin mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
              ) : c.status === "ok" ? (
                <Icon name="check" size={12} className="mt-[2px] shrink-0 text-pulse-green" />
              ) : c.status === "error" ? (
                <Icon name="x" size={12} className="mt-[2px] shrink-0 text-coral-red" />
              ) : (
                <Icon name="chevron-right" size={12} className="mt-[2px] shrink-0 text-fog" />
              )}
              <code className="min-w-0 flex-1 break-words font-mono text-[11px] leading-relaxed text-mist">
                {c.command}
              </code>
            </div>
            {c.status === "error" ? (
              <p className="mt-1 text-[10.5px] leading-snug text-coral-red">{c.error}</p>
            ) : null}
          </div>
        ))}
        {commands.length === 0 ? (
          <p className="px-0.5 text-[11px] text-fog">
            {state === "connecting" ? "Connecting with saved credential…" : "Queued"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProgressRail({ hosts, onConnectFromServers }) {
  return (
    <aside
      data-screen-label="Agent progress rail"
      className="flex w-[292px] shrink-0 flex-col border-l border-graphite bg-obsidian/30"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-graphite px-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">
          <Icon name="sliders" size={12} />
          Progress
        </div>
        <span className="rounded-pill bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog">
          {hosts.filter((h) => h.status === "done").length}/{hosts.length} done
        </span>
      </div>
      <div className="scroll-thin grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-2.5">
        {hosts.map((h) => (
          <HostProgressCard
            key={h.hostId}
            host={h.hostLabel}
            commands={h.commands}
            status={h.status}
          />
        ))}
      </div>
      {hosts.some((h) => h.status === "error") ? (
        <div className="shrink-0 border-t border-graphite px-3.5 py-2.5">
          <button
            type="button"
            onClick={onConnectFromServers}
            className="w-full rounded-md border border-graphite px-2.5 py-1.5 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Connect hosts from Servers
          </button>
        </div>
      ) : null}
    </aside>
  );
}

/* ----------------------------------------------------------------------------
 * Confirm dialog (high-risk) + credential banner (F6 / F8)
 * ------------------------------------------------------------------------- */

function AgentConfirmDialog({ card, onResolve }) {
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
              On {card.hostLabel} via headless SSH · the agent is asking permission to proceed.
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

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-coral-red">
              <Icon name="alert" size={12} />
              Why this is risky
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">{card.verdict.reason}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Icon name="chevron-right" size={12} />
              What will happen
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">
              {card.verdict.projectedEffect}
            </p>
          </div>
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
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px]">⌘⏎</kbd>{" "}
              run ·{" "}
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px]">Esc</kbd>{" "}
              cancel
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

function CredentialBanner({ onConnect }) {
  return (
    <div className="pop-in mt-3 rounded-xl border border-yellow-500/35 bg-yellow-500/8 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <Icon name="alert-circle" size={15} className="mt-0.5 shrink-0 text-yellow-400" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12.5px] font-medium text-mist">
            No saved credential for api-prod-01
          </p>
          <p className="m-0 mt-0.5 text-[11.5px] leading-relaxed text-fog">
            The agent couldn’t connect headlessly. Connect once from the Servers page to save
            credentials — the rest of the task is unaffected.
          </p>
          <button
            type="button"
            onClick={onConnect}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1 text-[11.5px] text-mist transition-colors hover:bg-white/5"
          >
            <Icon name="chevron-right" size={11} />
            Open Servers
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * AgentView — main entry. State machine same shape as AiSession but drives
 * the per-host progress rail and the scripted multi-host timelines.
 * ------------------------------------------------------------------------- */

function AgentView({ onConnectFromServers }) {
  const [scenario, setScenario] = useState("docker");
  const [phase, setPhase] = useState("idle"); // idle | streaming | awaiting-confirm | done | aborted
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(SCENARIOS.docker.request);
  const [hosts, setHosts] = useState([]); // [{ hostId, hostLabel, status, commands }]
  const [confirm, setConfirm] = useState(null);

  const inputRef = useRef(null);
  const timeoutsRef = useRef(new Map());
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const confirmResolverRef = useRef(null);
  const hostsRef = useRef(hosts);
  useEffect(() => {
    hostsRef.current = hosts;
  }, [hosts]);

  const busy = phase === "streaming" || phase === "awaiting-confirm";
  const awaitingConfirm = phase === "awaiting-confirm";

  const timeline = scenario === "docker" ? DOCKER_TIMELINE : FLEET_TIMELINE;

  const pushMessage = useCallback((m) => setMessages((prev) => [...prev, m]), []);
  const patchMessage = useCallback((id, patch) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m))), []);
  const patchHost = useCallback((hostId, patch) =>
    setHosts((prev) => prev.map((h) => (h.hostId === hostId ? { ...h, ...patch } : h))), []);
  const patchHostCommand = useCallback((hostId, cmdId, patch) =>
    setHosts((prev) =>
      prev.map((h) =>
        h.hostId === hostId
          ? {
              ...h,
              commands: h.commands.map((c) => (c.id === cmdId ? { ...c, ...patch } : c)),
            }
          : h,
      ),
    ), []);
  // Atomically add a host (if new) and append a command row to its rail.
  // Uses functional setState so concurrent segments in the same tick never
  // clobber each other via a stale ref.
  const appendHostCommand = useCallback((hostId, hostLabel, command) => {
    const cmdId = nextId("cmd");
    setHosts((prev) => {
      const existing = prev.find((h) => h.hostId === hostId);
      if (existing) {
        return prev.map((h) =>
          h.hostId === hostId
            ? { ...h, status: "working", commands: [...h.commands, { id: cmdId, command, status: "running" }] }
            : h,
        );
      }
      return [...prev, { hostId, hostLabel, status: "working", commands: [{ id: cmdId, command, status: "running" }] }];
    });
    return cmdId;
  }, []);

  const sleep = (ms) =>
    new Promise((resolve) => {
      if (cancelledRef.current) return resolve();
      const t = setTimeout(() => {
        timeoutsRef.current.delete(t);
        resolve();
      }, ms);
      timeoutsRef.current.set(t, resolve);
    });

  const cancelAllSleeps = () => {
    cancelledRef.current = true;
    timeoutsRef.current.forEach((resolve, t) => {
      clearTimeout(t);
      resolve();
    });
    timeoutsRef.current.clear();
  };

  const streamAssistant = async (text) => {
    const id = nextId("msg");
    pushMessage({ id, role: "assistant", text: "", streaming: true });
    const words = text.split(" ");
    let acc = "";
    for (let i = 0; i < words.length; i++) {
      if (cancelledRef.current) break;
      acc += (i ? " " : "") + words[i];
      patchMessage(id, { text: acc });
      await sleep(i % 3 === 0 ? 26 : 16);
    }
    patchMessage(id, { text: acc, streaming: false });
  };

  const ensureHost = (hostId, hostLabel) => {
    if (!hostsRef.current.some((h) => h.hostId === hostId)) {
      setHosts((prev) =>
        prev.some((h) => h.hostId === hostId)
          ? prev
          : [...prev, { hostId, hostLabel, status: "connecting", commands: [] }],
      );
    }
  };

  const runExec = async (seg) => {
    const id = nextId("msg");
    const verdict = seg.verdict;
    ensureHost(seg.hostId, seg.hostLabel);
    const cmdId = appendHostCommand(seg.hostId, seg.hostLabel, seg.cmd);
    const card = {
      id,
      role: "tool",
      cmd: seg.cmd,
      status: "pending",
      verdict,
      result: null,
      excerpt: seg.excerpt,
      expanded: false,
      hostLabel: seg.hostLabel,
    };
    pushMessage(card);

    await sleep(360);
    if (cancelledRef.current) return false;

    if (seg.credentialMissing) {
      patchMessage(id, { status: "credential-missing", result: { exitCode: null, durationMs: seg.durationMs, full: seg.full } });
      patchHostCommand(seg.hostId, cmdId, { status: "error", error: "Connection refused — no saved credential." });
      patchHost(seg.hostId, { status: "error" });
      return true;
    }

    if (verdict.allow) {
      patchMessage(id, { status: "running" });
      await sleep(Math.max(480, Math.min(seg.durationMs, 1400)));
      if (cancelledRef.current) return false;
      const result = { exitCode: seg.exitCode, durationMs: seg.durationMs, full: seg.full };
      patchMessage(id, { status: "done", result });
      patchHostCommand(seg.hostId, cmdId, { status: "ok" });
      return true;
    }

    // high-risk → confirmation
    setPhase("awaiting-confirm");
    const res = await new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirm({ id, cmd: seg.cmd, verdict, hostLabel: seg.hostLabel });
    });
    if (cancelledRef.current) return false;

    if (res.decision === "run") {
      const cmd = res.editedCmd || seg.cmd;
      if (cmd !== seg.cmd) {
        patchMessage(id, { cmd });
        patchHostCommand(seg.hostId, cmdId, { command: cmd });
      }
      setPhase("streaming");
      patchMessage(id, { status: "running" });
      await sleep(Math.max(560, Math.min(seg.durationMs, 1700)));
      if (cancelledRef.current) return false;
      const result = { exitCode: seg.exitCode, durationMs: seg.durationMs, full: seg.full };
      patchMessage(id, { status: "done", result });
      patchHostCommand(seg.hostId, cmdId, { status: "ok" });
      return true;
    }

    patchMessage(id, { status: "declined" });
    patchHostCommand(seg.hostId, cmdId, { status: "error", error: "Declined by user." });
    patchHost(seg.hostId, { status: "error" });
    setPhase("streaming");
    await streamAssistant(
      "Understood — I'll skip that. The rest of the health check is unaffected.",
    );
    return false;
  };

  const runTurn = async (userText) => {
    cancelledRef.current = false;
    runningRef.current = true;
    setPhase("streaming");
    setConfirm(null);
    setHosts([]);
    pushMessage({ id: nextId("msg"), role: "user", text: userText });

    for (const seg of timeline) {
      if (cancelledRef.current) break;
      if (seg.kind === "assistant") {
        await streamAssistant(seg.text);
      } else if (seg.kind === "headless") {
        ensureHost(seg.hostId, seg.hostLabel);
        await sleep(360);
        if (cancelledRef.current) break;
        patchHost(seg.hostId, { status: "working" });
      } else if (seg.kind === "exec") {
        const cont = await runExec(seg);
        if (!cont) break;
      }
    }

    // mark remaining connecting hosts as error if task aborted, else done
    if (cancelledRef.current) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role === "tool" && (m.status === "pending" || m.status === "running"))
            return { ...m, status: "aborted" };
          if (m.role === "assistant" && m.streaming) return { ...m, streaming: false };
          return m;
        }),
      );
      setHosts((prev) =>
        prev.map((h) =>
          h.status === "working" || h.status === "connecting"
            ? { ...h, status: "aborted" }
            : h,
        ),
      );
      setPhase("aborted");
    } else {
      setHosts((prev) =>
        prev.map((h) => (h.status === "working" ? { ...h, status: "done" } : h)),
      );
      setPhase("done");
    }
    runningRef.current = false;
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || runningRef.current) return;
    setInput("");
    void runTurn(text);
  };

  const handleAbort = () => {
    if (!runningRef.current) return;
    cancelAllSleeps();
    if (confirmResolverRef.current) {
      const r = confirmResolverRef.current;
      confirmResolverRef.current = null;
      setConfirm(null);
      r({ decision: "cancel" });
    }
  };

  const resolveConfirm = (decision, editedCmd) => {
    const r = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirm(null);
    if (r) r({ decision, editedCmd });
  };

  const toggleExpand = useCallback((cardId) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === cardId ? { ...m, expanded: !m.expanded } : m)),
    );
  }, []);

  const switchScenario = (id) => {
    if (runningRef.current) handleAbort();
    setScenario(id);
    setConfirm(null);
    setMessages([]);
    setHosts([]);
    setPhase("idle");
    cancelledRef.current = false;
    setInput(SCENARIOS[id].request);
  };

  // Esc: dismiss confirm → picker → abort
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (confirmResolverRef.current) {
        e.preventDefault();
        resolveConfirm("cancel");
        return;
      }
      if (runningRef.current) {
        e.preventDefault();
        handleAbort();
        return;
      }
      inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, awaitingConfirm]);

  const showCredentialBanner = messages.some(
    (m) => m.role === "tool" && m.status === "credential-missing",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-void" data-screen-label="Agent view">
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Left: chat column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* header */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-carbon px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
                <Icon name="sparkles" size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="m-0 text-[13px] font-semibold tracking-tight text-paper">
                    Agent
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-pill bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog">
                    <span
                      className={
                        "h-1.5 w-1.5 rounded-full " +
                        (awaitingConfirm
                          ? "bg-coral-red"
                          : busy
                            ? "standby-dot bg-acid-lime"
                            : "bg-pulse-green")
                      }
                    />
                    {awaitingConfirm ? "Approval" : busy ? "Working" : "Ready"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fog">
                  <Icon name="shield" size={11} />
                  <span className="truncate">Multi-host ops · headless SSH</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center rounded-md border border-graphite bg-obsidian/60">
                {Object.values(SCENARIOS).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.desc + " — " + s.preview}
                    onClick={() => switchScenario(s.id)}
                    className={
                      "rounded-[5px] px-2.5 py-1.5 text-[11.5px] transition-colors " +
                      (scenario === s.id
                        ? "bg-graphite text-mist"
                        : "text-fog hover:text-mist")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => switchScenario(scenario)}
                aria-label="New task"
                title="New task"
                className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
              >
                <Icon name="plus" size={15} />
              </button>
            </div>
          </div>

          {/* messages */}
          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-acid-lime/20 bg-acid-lime/10 text-acid-lime">
                <Icon name="sparkles" size={20} />
              </div>
              <h3 className="m-0 mt-4 text-[14px] font-medium text-mist">Agent standing by</h3>
              <p className="m-0 mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-fog">
                Type <span className="text-acid-lime">@</span> to pick a server or group, then
                describe the ops task — the agent connects headlessly and reports progress on
                the right.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AgentMessageStream messages={messages} onToggleExpand={toggleExpand} />
              {showCredentialBanner ? (
                <div className="shrink-0 px-4 pb-3">
                  <CredentialBanner onConnect={onConnectFromServers} />
                </div>
              ) : null}
            </div>
          )}

          <AgentComposer
            input={input}
            setInput={setInput}
            onSend={handleSend}
            busy={busy}
            awaitingConfirm={awaitingConfirm}
          />
        </div>

        {/* Right: progress rail */}
        {hosts.length > 0 ? (
          <ProgressRail hosts={hosts} onConnectFromServers={onConnectFromServers} />
        ) : null}
      </div>

      {confirm ? (
        <AgentConfirmDialog card={confirm} onResolve={resolveConfirm} />
      ) : null}
    </div>
  );
}

Object.assign(window, { AgentView });
