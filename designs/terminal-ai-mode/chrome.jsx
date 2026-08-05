// chrome.jsx — presentational terminal-workspace chrome:
//   Sidebar  (navigation-aware; defaults preserve the standalone AI demo)
//   Terminal (faux xterm pane + [AI] echo blocks + floating action toolbar)
// Exported to `window`.

const { useEffect, useRef } = React;
const { Icon, SESSION, SCROLLBACK, PROMPT, lineTokens } = window;

/* ----------------------------------------------------------------------------
 * Sidebar
 * ------------------------------------------------------------------------- */

function Sidebar({
  activeView,
  onNavigate,
  sessions,
  activeSessionId,
  onOpenSession,
  onOpenPrefs,
  vault = "Local vault",
  recent,
  onOpenHistory,
}) {
  return (
    <aside className="relative flex min-h-screen w-[266px] shrink-0 flex-col border-r border-graphite bg-carbon px-2.5 pb-4 pt-3 text-mist">
      {/* macOS traffic lights */}
      <div aria-hidden="true" className="flex h-[30px] gap-2 px-0.5">
        <span className="h-3 w-3 rounded-full bg-coral-red/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
        <span className="h-3 w-3 rounded-full bg-pulse-green/80" />
      </div>

      <div className="flex items-center justify-between px-2.5 pb-3.5">
        <button
          type="button"
          aria-label="Preferences"
          title="Preferences"
          onClick={onOpenPrefs}
          className="focus-ring grid h-8 w-8 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist"
        >
          <Icon name="settings" size={17} />
        </button>
        <div
          aria-label="Buzz home"
          className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-graphite text-mist"
        >
          <Icon name="network" size={18} />
        </div>
      </div>

      <PrimaryNav activeView={activeView} onNavigate={onNavigate} />

      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onOpenSession={onOpenSession}
      />

      <RecentSection recent={recent} onOpenHistory={onOpenHistory} onNavigate={onNavigate} />

      <div className="mt-auto flex items-center gap-2 px-2.5 pt-3 text-[12px] text-fog">
        <span className="h-[7px] w-[7px] rounded-full bg-pulse-green ring-2 ring-pulse-green/15" />
        <Icon name="lock" size={14} />
        <span>{vault}</span>
      </div>
    </aside>
  );
}

const NAV_ITEMS = [
  { id: "servers", label: "Servers", icon: "server" },
  { id: "agent", label: "Agent", icon: "sparkles" },
  { id: "sftp", label: "SFTP", icon: "folder" },
  { id: "forwarding", label: "Port Forwarding", icon: "network" },
  { id: "history", label: "History", icon: "history" },
];

function PrimaryNav({ activeView, onNavigate }) {
  return (
    <nav aria-label="Primary" className="grid gap-1.5">
      {NAV_ITEMS.map((item) => {
        const active = activeView === item.id;
        const cls =
          "flex min-h-[40px] items-center gap-3 rounded-[10px] px-3.5 text-[13px] no-underline transition-colors " +
          (active
            ? "bg-graphite text-mist shadow-[inset_3px_0_#e4f222]"
            : "text-fog hover:bg-white/5 hover:text-mist");
        if (onNavigate) {
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              className={cls + " text-left"}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </button>
          );
        }
        return (
          <a key={item.id} href={`#${item.id}`} onClick={(e) => e.preventDefault()} className={cls}>
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

const DEFAULT_SESSIONS = [
  { id: "web", title: SESSION.title, status: "connected" },
  { id: "db", title: "db-replica-02", status: "connected" },
];

function statusDot(status) {
  if (status === "connected" || status === "online") return "bg-pulse-green";
  if (status === "failed") return "bg-coral-red";
  if (status === "connecting") return "bg-yellow-400";
  return "bg-fog/50";
}

function SessionList({ sessions, activeSessionId, onOpenSession }) {
  const list = sessions ?? DEFAULT_SESSIONS;
  return (
    <nav aria-label="Sessions" className="mt-3 grid gap-1 border-t border-graphite pt-3">
      <div className="px-3.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">
        Active sessions
      </div>
      {list.map((s) => {
        const active = s.id === activeSessionId;
        const inner = (
          <>
            <Icon name="grip" size={13} className="opacity-0 group-hover/row:opacity-65" />
            <Icon name="terminal" size={16} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{s.title}</span>
            <span aria-hidden="true" className={"ml-auto h-[7px] w-[7px] rounded-full " + statusDot(s.status)} />
          </>
        );
        const rowCls =
          "group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-[10px] " +
          (active ? "bg-graphite shadow-[inset_3px_0_#e4f222]" : "");
        const btnCls =
          "flex min-h-[38px] min-w-0 items-center gap-2.5 rounded-[10px] bg-transparent py-0 pl-3 pr-[26px] text-left text-[13px] " +
          (active ? "text-paper" : "text-fog hover:bg-white/5 hover:text-mist");
        return (
          <div key={s.id} className={rowCls}>
            {onOpenSession ? (
              <button type="button" aria-current={active ? "page" : undefined} onClick={() => onOpenSession(s.id)} className={btnCls}>
                {inner}
              </button>
            ) : (
              <button type="button" aria-current={active ? "page" : undefined} className={btnCls}>
                {inner}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function RecentSection({ recent, onOpenHistory, onNavigate }) {
  const hasRecent = recent && recent.length > 0;
  return (
    <section className="mx-0 mt-3 border-t border-graphite pt-3">
      <div className="flex items-center justify-between px-3.5 pb-1">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">
          <Icon name="history" size={12} />
          Recent
        </div>
        {hasRecent && (onOpenHistory || onNavigate) ? (
          <button
            type="button"
            onClick={() => (onOpenHistory ? onOpenHistory() : onNavigate("history"))}
            className="text-[11px] text-fog transition-colors hover:text-mist"
          >
            Show more
          </button>
        ) : null}
      </div>
      {hasRecent ? (
        <div className="mt-1 grid gap-0.5">
          {recent.slice(0, 4).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onNavigate?.("history")}
              className="flex min-w-0 items-center gap-2.5 rounded-[10px] px-3.5 py-1.5 text-left text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <span aria-hidden="true" className={"h-[6px] w-[6px] shrink-0 rounded-full " + statusDot(r.status)} />
              <span className="truncate">{r.host}</span>
              <span className="ml-auto shrink-0 text-[11px] text-fog/60">{r.when}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-2.5 px-3.5 text-fog">
          <Icon name="terminal" size={16} />
          <p className="m-0 text-[12px] leading-relaxed">Your recent sessions will appear here.</p>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Terminal pane
 * ------------------------------------------------------------------------- */

function TerminalLine({ line }) {
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

function EchoBlock({ block }) {
  const { cmd, status, result } = block;
  const exit = result?.exitCode;
  const ok = status === "done" && exit === 0;
  const failed = status === "done" && exit !== 0;
  const declined = status === "declined";
  const aborted = status === "aborted";

  let exitLabel = null;
  if (status === "running") exitLabel = <span className="c-dim">running…</span>;
  else if (ok) exitLabel = <><span className="c-lime">[AI]</span> <span className="c-green">exit 0</span></>;
  else if (failed)
    exitLabel = (
      <>
        <span className="c-lime">[AI]</span> <span className="c-red">exit {exit}</span>
      </>
    );
  else if (declined)
    exitLabel = (
      <>
        <span className="c-lime">[AI]</span> <span className="c-yellow">⨯ declined by user</span>
      </>
    );
  else if (aborted)
    exitLabel = (
      <>
        <span className="c-lime">[AI]</span> <span className="c-yellow">⨯ aborted</span>
      </>
    );

  const excerpt = result ? result.full.slice(0, block.echoLines) : [];

  return (
    <div className="mt-2">
      <div className="whitespace-pre-wrap break-words">
        <span className="c-lime">[AI]</span> <span className="c-dim">$</span>{" "}
        <span className="c-white">{cmd}</span>
      </div>
      {status === "running" ? (
        <div className="c-dim">…</div>
      ) : (
        excerpt.map((line, i) => <TerminalLine key={i} line={line} />)
      )}
      {exitLabel ? (
        <div className="whitespace-pre-wrap break-words">
          {exitLabel}
          {result?.durationMs != null && status === "done" ? (
            <span className="c-dim">  ({window.formatDuration(result.durationMs)})</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TerminalToolbar({ aiOn, onToggleAi }) {
  const ghost =
    "grid h-[30px] w-[30px] place-items-center rounded-md text-mist/80 hover:bg-white/10 hover:text-white";
  return (
    <div className="absolute right-3 top-2.5 z-20 flex items-center gap-1 rounded-[10px] border border-white/10 bg-obsidian/85 p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.25)] backdrop-blur-md">
      <button
        type="button"
        aria-pressed={aiOn}
        aria-label="Toggle AI mode (⌘I)"
        title="Toggle AI mode  (⌘I)"
        onClick={onToggleAi}
        className={
          "flex h-[30px] items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium tracking-tight transition-colors " +
          (aiOn
            ? "bg-acid-lime text-void"
            : "text-mist hover:bg-white/10")
        }
      >
        <Icon name="sparkles" size={15} />
        <span>AI</span>
      </button>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/10" />
      <label className="flex h-[30px] items-center gap-1.5 rounded-md px-2 text-[12px] text-mist/80 hover:bg-white/10">
        <Icon name="sliders" size={14} />
        <span>Pro</span>
        <Icon name="chevron-down" size={13} className="text-fog" />
      </label>
      <button type="button" aria-label="Split right" className={ghost}>
        <Icon name="columns" size={16} />
      </button>
      <button type="button" aria-label="Split down" className={ghost}>
        <Icon name="rows" size={16} />
      </button>
      <button type="button" aria-label="Toggle commands" className={ghost}>
        <Icon name="panel" size={16} />
      </button>
      <button type="button" aria-label="Close pane" className={ghost}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

function Terminal({ echoBlocks, aiOn, onToggleAi, host = SESSION, prompt = PROMPT, scrollback = SCROLLBACK }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [echoBlocks.length, echoBlocks[echoBlocks.length - 1]?.status]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      <TerminalToolbar aiOn={aiOn} onToggleAi={onToggleAi} />
      <div
        ref={ref}
        className="term scroll-thin h-full w-full overflow-y-auto px-4 py-3"
        aria-label={`SSH session ${host.user}@${host.host}`}
      >
        {scrollback.map((line, i) => (
          <TerminalLine key={`s-${i}`} line={line} />
        ))}

        {echoBlocks.map((b) => (
          <EchoBlock key={b.id} block={b} />
        ))}

        {/* live prompt + blinking cursor */}
        <div className="mt-1 flex items-center whitespace-pre-wrap break-words">
          {prompt.map((tok, i) => (
            <span key={i} className={tok[1] || undefined}>
              {tok[0]}
            </span>
          ))}
          <span
            aria-hidden="true"
            className="cursor-blink ml-1 inline-block h-[14px] w-[8px] translate-y-[2px] bg-[#f2f2f2]"
          />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Terminal });
