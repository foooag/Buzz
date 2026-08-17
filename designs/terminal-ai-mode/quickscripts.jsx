// quickscripts.jsx — AI 快捷指令 (Quick Scripts) suggestion cards for the AI
//   assistant panel, per PRD docs/prd/2026-08-17-buzz-quick-scripts.md:
//   QuickScriptsSection (panel-top card group), QuickScriptCard (execute /
//   pin / edit / dismiss lifecycle + hover tooltip), QuickScriptEditDialog,
//   QuickScriptConfirmDialog (risk gate), QuickScriptToast (undo), plus the
//   mock generation engine and the per-host localStorage store.
//   The cards are a transient UI layer — they never push AiAgentMessages and
//   never enter the conversation history; only their executions echo into the
//   terminal like any other command run. Exported to `window`.

const { useState, useEffect } = React;
const { Icon, nextId } = window;

/* ----------------------------------------------------------------------------
 * Triggers + risk gate (mock of AiShellRiskRuntime)
 * ------------------------------------------------------------------------- */

const QUICK_SLASH_TRIGGERS = ["/生成快捷指令", "/quick-script"];

const QUICK_SLASH_COMMANDS = [
  { token: "/生成快捷指令", alias: "/quick-script", hint: "复盘本会话 · 生成快捷执行脚本" },
];

function isRiskyQuickScript(script) {
  return (
    /(^|[;&|\s])(sudo|shutdown|reboot|halt|poweroff|pkill|killall|mkfs|dd)\b/i.test(script) ||
    /systemctl\s+(restart|stop|start|reload)/i.test(script) ||
    /\bkill\s+-9\b/i.test(script) ||
    /\brm\s+-[rR]/i.test(script)
  );
}

/* ----------------------------------------------------------------------------
 * Data model + mock LLM library
 *   QuickScript ≈ the wire type from §4.2: { id, title, script, description,
 *   riskHint, sourceUsageCount, sourceSuccessCount, executedCount,
 *   confidence, status, isNew, mode, createdAt }
 * ------------------------------------------------------------------------- */

function toQuickScriptItem(lib, mode) {
  return {
    id: nextId("qs"),
    title: lib.title,
    script: lib.script,
    description: lib.description ?? null,
    riskHint: lib.riskHint ?? null,
    sourceUsageCount: lib.usage,
    sourceSuccessCount: lib.success,
    executedCount: 0,
    confidence: lib.confidence,
    status: "suggested",
    isNew: true,
    mode,
    createdAt: Date.now(),
  };
}

// LLM-mode output for the scripted web-prod-01 502 investigation. Script
// bodies are verbatim session commands (TIMELINE / scrollback); the model
// only names, describes, and re-combines them.
const DEMO_QUICK_LIBRARY = [
  {
    title: "查看 nginx 错误日志",
    script: "tail -n 30 /var/log/nginx/error.log",
    description: "读取最近 30 条 nginx 错误日志，定位 upstream 连接失败等故障。",
    usage: 5,
    success: 5,
    confidence: 0.94,
  },
  {
    title: "本地健康检查",
    script: 'curl -sS -o /dev/null -w "health=%{http_code}\\n" http://127.0.0.1:8000/health',
    description: "探测本机 8000 端口健康端点，确认 gunicorn 存活。",
    usage: 6,
    success: 6,
    confidence: 0.95,
  },
  {
    title: "重启 gunicorn 并验证",
    script:
      'sudo systemctl restart gunicorn\ncurl -sS -o /dev/null -w "health=%{http_code}\\n" http://127.0.0.1:8000/health',
    description: "重启 gunicorn 后立即探测健康端点，确认恢复。",
    riskHint: "会重启生产服务 gunicorn，流量中断约 2–4 秒。",
    usage: 2,
    success: 2,
    confidence: 0.9,
  },
  {
    title: "检查 gunicorn 服务状态",
    script: "systemctl status gunicorn --no-pager",
    description: "查看 gunicorn 单元运行状态、崩溃原因与最近日志。",
    usage: 3,
    success: 2,
    confidence: 0.88,
  },
];

// Rules-mode fallback (scenario D): frequency-sorted session commands taken
// verbatim, titled by their first line — fully offline.
function rulesFromCommands(sessionCommands) {
  const counts = new Map();
  for (const c of sessionCommands) counts.set(c, (counts.get(c) || 0) + 1);
  const total = sessionCommands.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cmd, n]) => {
      const first = cmd.split("\n")[0];
      return {
        id: nextId("qs"),
        title: first.length > 30 ? first.slice(0, 30) + "…" : first,
        script: cmd,
        description: null,
        riskHint: null,
        sourceUsageCount: n,
        sourceSuccessCount: n,
        executedCount: 0,
        confidence: Math.min(0.95, 0.4 + 0.55 * (n / total)),
        status: "suggested",
        isNew: true,
        mode: "rules",
        createdAt: Date.now(),
      };
    });
}

// The mock generation IPC: analyze the current session, return structured
// scripts. mode "empty" = scenario E (no ssh_exec calls in this session).
function quickscriptEngine(host, sessionCommands) {
  if (host.host === "web-prod-01") {
    if (!sessionCommands.length) return { mode: "empty", items: [] };
    const seen = new Set(sessionCommands);
    const items = DEMO_QUICK_LIBRARY.filter((lib) =>
      lib.script.split("\n").every((line) => seen.has(line)),
    ).map((lib) => toQuickScriptItem(lib, "llm"));
    if (items.length) return { mode: "llm", items };
    return { mode: "rules", items: rulesFromCommands(sessionCommands) };
  }
  if (!sessionCommands.length) return { mode: "empty", items: [] };
  return { mode: "rules", items: rulesFromCommands(sessionCommands) };
}

function normalizeQuickScript(script) {
  return script
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
}

// Merge a fresh generation into the stored pool: existing scripts keep their
// pinned status and gain updated stats; only genuinely new entries get the
// 「新」 badge. Dismissed entries always survive (never flow back).
function mergeGeneratedQuickScripts(prev, incoming) {
  let next = prev.map((s) => ({ ...s, isNew: false }));
  let created = 0;
  for (const item of incoming) {
    const key = normalizeQuickScript(item.script);
    const idx = next.findIndex(
      (s) => s.status !== "dismissed" && normalizeQuickScript(s.script) === key,
    );
    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        sourceUsageCount: item.sourceUsageCount,
        sourceSuccessCount: item.sourceSuccessCount,
        confidence: item.confidence,
        description: item.description ?? next[idx].description,
      };
    } else {
      next.push({ ...item, isNew: true });
      created += 1;
    }
  }
  const pinned = next.filter((s) => s.status === "pinned");
  const dismissed = next.filter((s) => s.status === "dismissed");
  const suggested = next
    .filter((s) => s.status === "suggested")
    .sort((a, b) => b.confidence - a.confidence);
  next = [...pinned, ...suggested.slice(0, Math.max(0, 8 - pinned.length)), ...dismissed];
  return { list: next, created };
}

// Fake the executed script's terminal result by reusing matching scripted
// timeline segments; unknown lines get a quiet "(no output)".
function simulateScriptResult(script) {
  const segs = []
    .concat(Array.isArray(window.TIMELINE) ? window.TIMELINE : [])
    .concat(
      window.INV && Array.isArray(window.INV.GENERIC_TIMELINE) ? window.INV.GENERIC_TIMELINE : [],
    )
    .filter((s) => s && s.kind === "exec");
  let full = [];
  let durationMs = 0;
  let exitCode = 0;
  for (const line of script.split("\n")) {
    const seg = segs.find((s) => s.cmd === line);
    if (seg) {
      full = full.concat(seg.full.slice(0, 4));
      durationMs += seg.durationMs;
      if (seg.exitCode !== 0) exitCode = seg.exitCode;
    } else {
      durationMs += 240;
      full.push([["(no output)", "c-dim"]]);
    }
  }
  return { exitCode, durationMs: durationMs || 300, full: full.slice(0, 10) };
}

/* ----------------------------------------------------------------------------
 * Per-host store (quick_scripts table, AES-GCM in the real app)
 * ------------------------------------------------------------------------- */

function quickScriptKey(host) {
  return "buzz.quickscripts.v1." + ((host && (host.host || host.title)) || "unknown");
}

// First-load seed for the scripted demo host: two scripts as if a previous
// 502-debugging session had generated them (one pinned, one used a few
// times) — so the card group is demonstrable before any generation.
function seedQuickScripts(host) {
  if (!host || host.host !== "web-prod-01") return [];
  const now = Date.now();
  const a = toQuickScriptItem(DEMO_QUICK_LIBRARY[0], "llm");
  a.status = "pinned";
  a.executedCount = 12;
  a.isNew = false;
  a.createdAt = now - 2 * 86400000;
  const b = toQuickScriptItem(DEMO_QUICK_LIBRARY[1], "llm");
  b.executedCount = 3;
  b.isNew = false;
  b.createdAt = now - 2 * 86400000;
  return [a, b];
}

const quickscriptStore = {
  load(host) {
    try {
      const raw = window.localStorage.getItem(quickScriptKey(host));
      if (raw === null) {
        const seeded = seedQuickScripts(host);
        if (seeded.length) window.localStorage.setItem(quickScriptKey(host), JSON.stringify(seeded));
        return seeded;
      }
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },
  save(host, list) {
    try {
      window.localStorage.setItem(quickScriptKey(host), JSON.stringify(list));
    } catch {
      /* storage full / private mode — non-fatal */
    }
  },
  loadCollapsed(host) {
    try {
      return window.localStorage.getItem(quickScriptKey(host) + ".collapsed") === "1";
    } catch {
      return false;
    }
  },
  saveCollapsed(host, collapsed) {
    try {
      window.localStorage.setItem(quickScriptKey(host) + ".collapsed", collapsed ? "1" : "0");
    } catch {
      /* non-fatal */
    }
  },
};

/* ----------------------------------------------------------------------------
 * QuickScriptsSection — the suggestion card group at the top of the panel
 * ------------------------------------------------------------------------- */

function QuickScriptsSection({
  host,
  visible,
  poolCount,
  hasMore,
  gen,
  collapsed,
  onToggleCollapse,
  onShuffle,
  onExecute,
  onPin,
  onEdit,
  onDismiss,
}) {
  const working = gen.phase === "working";
  const flash = gen.phase === "done";
  const emptyHint = gen.phase === "empty";
  const failed = gen.phase === "failed";

  return (
    <section
      aria-label="快捷指令"
      data-screen-label="Quick scripts suggestions"
      className="shrink-0 px-3 pt-3"
    >
      <div className="rounded-xl border border-graphite/70 bg-graphite/25">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <Icon name="sparkles" size={13} className="shrink-0 text-acid-lime" />
          <span className="shrink-0 text-[12px] font-semibold tracking-tight text-mist">快捷指令</span>
          <span className="min-w-0 truncate text-[11px] text-fog/80">{host.host}</span>
          {working ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1.5 text-[11px] text-fog">
              <span className="spin h-3 w-3 shrink-0 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
              正在复盘本会话…
            </span>
          ) : null}
          {flash ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-pulse-green">
              <Icon name="check" size={12} className="shrink-0" />
              {gen.count > 0 ? `已生成 ${gen.count} 条` : "本会话脚本已是最新"}
            </span>
          ) : null}
          {failed ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-coral-red">
              <Icon name="alert" size={12} className="shrink-0" />
              生成失败 · 已回退规则模式
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {hasMore && !collapsed ? (
              <button
                type="button"
                onClick={onShuffle}
                title="换一批"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
              >
                <Icon name="refresh" size={11} />
                换一批
              </button>
            ) : null}
            {collapsed ? (
              <span className="mr-1 rounded-pill bg-graphite/80 px-1.5 py-0.5 text-[10px] text-fog">
                {poolCount} 条
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "展开快捷指令" : "收起快捷指令"}
              title={collapsed ? "展开" : "收起"}
              className="grid h-6 w-6 place-items-center rounded text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <Icon name="chevron-down" size={13} className={collapsed ? "" : "rotate-180"} />
            </button>
          </div>
        </div>

        {!collapsed ? (
          emptyHint ? (
            <div className="flex items-start gap-2 px-3 pb-3 pt-1 text-[11.5px] leading-relaxed text-fog">
              <Icon name="terminal" size={13} className="mt-0.5 shrink-0 text-fog/70" />
              <p className="m-0">
                当前会话还没有命令执行记录——先让 AI 执行几次操作，再输入{" "}
                <span className="rounded border border-graphite bg-carbon px-1 py-px font-mono text-[10.5px] text-mist">
                  /生成快捷指令
                </span>
              </p>
            </div>
          ) : (
            <div className="grid gap-1 px-1.5 pb-1.5">
              {visible.map((qs) => (
                <QuickScriptCard
                  key={qs.id}
                  qs={qs}
                  onExecute={onExecute}
                  onPin={onPin}
                  onEdit={onEdit}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * QuickScriptCard — one suggestion row
 * ------------------------------------------------------------------------- */

function quickScriptStats(qs) {
  if (!qs.sourceUsageCount) return { pct: null };
  return { pct: Math.round((qs.sourceSuccessCount / qs.sourceUsageCount) * 100) };
}

function QuickScriptCard({ qs, onExecute, onPin, onEdit, onDismiss }) {
  const pinned = qs.status === "pinned";
  const { pct } = quickScriptStats(qs);
  const lines = qs.script.split("\n");
  const first = lines[0];
  const extra = lines.length - 1;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  const actBtn =
    "grid h-[22px] w-[22px] place-items-center rounded-md text-fog transition-colors hover:bg-white/10 hover:text-mist";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onExecute(qs)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExecute(qs);
        }
      }}
      className={
        "group relative min-w-0 cursor-pointer rounded-[10px] border bg-carbon/80 px-2.5 py-[7px] transition-colors focus-ring " +
        (pinned
          ? "border-acid-lime/30 bg-acid-lime/[0.04] shadow-[inset_2px_0_0_rgba(228,242,34,0.55)]"
          : "border-graphite/60 hover:border-smoke")
      }
    >
      <div className="flex items-center gap-2">
        {qs.isNew ? (
          <span className="shrink-0 rounded bg-acid-lime/15 px-1 py-px text-[9.5px] font-semibold text-acid-lime">
            新
          </span>
        ) : null}
        {qs.mode === "rules" ? (
          <span className="shrink-0 rounded border border-smoke/60 bg-graphite/50 px-1 py-px text-[9.5px] text-fog">
            规则
          </span>
        ) : null}
        <span className="max-w-[46%] shrink-0 truncate text-[12px] font-medium tracking-tight text-mist">
          {qs.title}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] leading-none text-fog">
          {qs.riskHint ? (
            <Icon
              name="alert"
              size={10}
              className="mr-1 inline-block translate-y-[1px] text-yellow-400"
            />
          ) : null}
          {first}
          {extra > 0 ? <span className="text-fog/60"> ⏎+{extra}</span> : null}
        </span>

        {/* right slot: meta badges swap to hover actions */}
        <span className="relative h-[22px] shrink-0">
          <span className="flex h-full items-center gap-1 transition-opacity duration-150 group-hover:opacity-0">
            {pinned ? <Icon name="pin" size={11} className="text-acid-lime" /> : null}
            {qs.executedCount > 0 ? (
              <span
                title={`已通过卡片执行 ${qs.executedCount} 次`}
                className="inline-flex items-center gap-0.5 rounded-pill bg-graphite/80 px-1.5 text-[10px] text-fog"
              >
                <Icon name="play" size={8} />
                {qs.executedCount}
              </span>
            ) : null}
            {pct !== null ? (
              <span
                title={`本会话使用 ${qs.sourceUsageCount} 次 · 成功率 ${pct}%`}
                className="whitespace-nowrap rounded-pill bg-graphite/80 px-1.5 text-[10px] text-fog"
              >
                {qs.sourceUsageCount}次·{pct}%
              </span>
            ) : null}
          </span>
          <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button
              type="button"
              aria-label={"执行 " + qs.title}
              title="写入终端执行"
              onClick={stop(() => onExecute(qs))}
              className={actBtn}
            >
              <Icon name="play" size={12} />
            </button>
            <button
              type="button"
              aria-label={pinned ? "取消置顶" : "采纳置顶"}
              title={pinned ? "取消置顶" : "采纳置顶"}
              onClick={stop(() => onPin(qs.id))}
              className={actBtn + (pinned ? " text-acid-lime" : "")}
            >
              <Icon name="pin" size={12} />
            </button>
            <button
              type="button"
              aria-label={"编辑 " + qs.title}
              title="编辑"
              onClick={stop(() => onEdit(qs))}
              className={actBtn}
            >
              <Icon name="edit" size={12} />
            </button>
            <button
              type="button"
              aria-label={"忽略 " + qs.title}
              title="忽略（不再出现）"
              onClick={stop(() => onDismiss(qs.id))}
              className="grid h-[22px] w-[22px] place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        </span>
      </div>

      {/* hover tooltip — full script, per F6 */}
      <span className="pointer-events-none absolute left-2 right-2 top-full z-30 mt-1 hidden rounded-lg border border-graphite bg-carbon px-2.5 py-2 text-left shadow-[0_14px_44px_rgb(0_0_0/0.55)] group-hover:block">
        <span className="block text-[11px] font-medium text-mist">{qs.title}</span>
        {qs.description ? (
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-fog">{qs.description}</span>
        ) : null}
        {qs.riskHint ? (
          <span className="mt-1 flex items-center gap-1 text-[10.5px] text-yellow-400">
            <Icon name="alert" size={10} />
            {qs.riskHint}
          </span>
        ) : null}
        <span className="mt-1.5 block whitespace-pre-wrap break-all rounded-md border border-graphite/70 bg-black/50 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-mist/90">
          {qs.script}
        </span>
        <span className="mt-1 block text-[10px] text-fog/70">
          本会话使用 {qs.sourceUsageCount} 次 · 成功率 {pct === null ? "--" : pct + "%"}
          {qs.executedCount > 0 ? ` · 已执行 ${qs.executedCount} 次` : ""}
          {qs.mode === "rules" ? " · 规则模式生成" : ""}
        </span>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Edit dialog
 * ------------------------------------------------------------------------- */

function QuickScriptEditDialog({ qs, host, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(qs.title);
  const [script, setScript] = useState(qs.script);
  const dirty = title.trim() !== qs.title || script !== qs.script;
  const canSave = dirty && title.trim().length > 0 && script.trim().length > 0;
  const { pct } = quickScriptStats(qs);

  const handleKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSave) onSave({ title, script });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="pop-in w-[min(520px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
            <Icon name="edit" size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">编辑快捷指令</h2>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Icon name="server" size={12} />
              On {host.user}@{host.host}
              <span className="text-fog/40">·</span>
              本会话使用 {qs.sourceUsageCount} 次 · 成功率 {pct === null ? "--" : pct + "%"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              名称
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-graphite bg-black/30 px-2.5 py-2 text-[13px] text-mist outline-none transition-colors focus:border-smoke"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              脚本
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              spellCheck={false}
              rows={6}
              className="scroll-thin w-full resize-none rounded-md border border-graphite bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist outline-none transition-colors focus:border-smoke"
            />
            <p className="m-0 mt-1.5 text-[11px] text-fog/80">
              多行脚本执行时整块写入终端（bracketed paste），不会被 shell 逐行截断。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onDelete(qs.id)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] text-coral-red transition-colors hover:bg-coral-red/12"
          >
            <Icon name="trash" size={13} />
            删除
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">
                ⌘⏎
              </kbd>{" "}
              保存
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => canSave && onSave({ title, script })}
              disabled={!canSave}
              className={
                "rounded-md px-4 py-2 text-[13px] font-semibold tracking-tight transition-colors " +
                (canSave
                  ? "bg-acid-lime text-void hover:brightness-105"
                  : "cursor-default bg-graphite text-fog")
              }
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Risk confirm dialog (scenario C — the card's riskHint is display-only;
 * execution still goes through the gate)
 * ------------------------------------------------------------------------- */

function QuickScriptConfirmDialog({ qs, host, onResolve }) {
  const handleKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onResolve("cancel");
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onResolve("run");
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
        onKeyDown={handleKey}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
            <Icon name="alert" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">确认执行快捷指令</h2>
              <span className="rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
                high
              </span>
            </div>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Icon name="server" size={12} />
              On {host.user}@{host.host} · 来自「{qs.title}」卡片，批准后写入当前终端执行。
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Icon name="terminal" size={12} />
              脚本
            </div>
            <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md border border-smoke bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist scroll-thin">
              {qs.script}
            </pre>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-yellow-400">
              <Icon name="alert" size={12} />
              风险提示
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">
              {qs.riskHint || "包含 sudo 或服务重启等高危操作，可能影响生产流量。"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onResolve("cancel")}
            className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            取消
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">
                ⌘⏎
              </kbd>{" "}
              执行 ·{" "}
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">
                Esc
              </kbd>{" "}
              取消
            </span>
            <button
              type="button"
              onClick={() => onResolve("run")}
              className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              执行
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Undo toast (dismiss / delete)
 * ------------------------------------------------------------------------- */

function QuickScriptToast({ undo, onUndo }) {
  if (!undo) return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-center">
      <div className="pop-in pointer-events-auto relative flex w-full max-w-[340px] items-center gap-2.5 overflow-hidden rounded-lg border border-smoke bg-carbon/95 px-3 py-2.5 shadow-[0_14px_44px_rgb(0_0_0/0.55)] backdrop-blur">
        <Icon
          name={undo.kind === "delete" ? "trash" : "x"}
          size={13}
          className="shrink-0 text-fog"
        />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-mist">
          {undo.kind === "delete" ? "已删除" : "已忽略"}「{undo.qs.title}」
          {undo.kind === "dismiss" ? "，不再出现在建议里" : ""}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-md border border-graphite px-2 py-1 text-[11px] text-mist transition-colors hover:border-smoke"
        >
          撤销
        </button>
        <span className="qs-toast-bar absolute bottom-0 left-0 h-[2px] bg-acid-lime/70" />
      </div>
    </div>
  );
}

Object.assign(window, {
  QuickScriptsSection,
  QuickScriptCard,
  QuickScriptEditDialog,
  QuickScriptConfirmDialog,
  QuickScriptToast,
  quickscriptStore,
  quickscriptEngine,
  mergeGeneratedQuickScripts,
  simulateScriptResult,
  isRiskyQuickScript,
  QUICK_SLASH_TRIGGERS,
  QUICK_SLASH_COMMANDS,
});
