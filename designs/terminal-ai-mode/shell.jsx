// shell.jsx — BuzzApp: the full app router.
//   Navigable sidebar (Servers / SFTP / Port Forwarding / History),
//   the four resource views, a connected-session view that reuses AiSession,
//   and the Preferences window. Global nav shortcuts (⌘T/⌘P/⌘,/⌘L).
// Mounts to #root in Buzz.html.

const { useState, useCallback, useEffect } = React;
const { Sidebar } = window;
const { AiSession } = window;
const { ServersView, SftpView, PortForwardingView, HistoryView } = window;
const { PreferencesWindow } = window;
const { Icon, SESSION, TIMELINE } = window;
const { INV } = window;

const LOCAL_SHELL = {
  id: "local",
  name: "Local Shell",
  username: "you",
  protocol: "local",
  address: "localhost",
};

function toSessionHost(h) {
  return { title: h.name, user: h.username ?? "you", host: h.name, cwd: "~" };
}

function BuzzApp() {
  const [activeView, setActiveView] = useState("servers");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [openSessions, setOpenSessions] = useState([]); // {id, host, title, protocol, timeline}
  const [activeSessionId, setActiveSessionId] = useState(null);

  // Preferences state (theme/font/size drive the Terminal-section live preview)
  const [theme, setTheme] = useState("th-termius-dark");
  const [font, setFont] = useState("f-jet");
  const [fontSize, setFontSize] = useState(13);

  const activeSession = openSessions.find((s) => s.id === activeSessionId) || null;

  const connectHost = useCallback((payload) => {
    let host = payload?.host ?? payload;
    let timeline = INV.GENERIC_TIMELINE;
    if (payload?.quick) {
      // Parse "ssh user@host" or "user@host"; fall back to the demo host.
      const m = payload.raw.match(/(?:ssh\s+)?([\w.-]+)@([\w.-]+)/);
      if (m) {
        host = {
          id: "qc-" + m[2],
          name: m[2],
          username: m[1],
          protocol: "ssh",
          address: m[2],
        };
      } else {
        host = INV.HOSTS.find((h) => h.id === "h-web-prod-01");
      }
    }
    const isDemo = host?.id === "h-web-prod-01";
    if (isDemo) timeline = TIMELINE;
    const id = host?.id ?? "session";
    setOpenSessions((prev) =>
      prev.some((s) => s.id === id)
        ? prev
        : [...prev, { id, host, title: host.name, protocol: host.protocol, timeline }],
    );
    setActiveSessionId(id);
  }, []);

  const reconnectByName = useCallback(
    (name) => {
      const found = INV.HOSTS.find((h) => h.name === name);
      connectHost({ host: found ?? INV.HOSTS[0] });
    },
    [connectHost],
  );

  const navigate = useCallback((view) => {
    setActiveView(view);
    setActiveSessionId(null);
  }, []);

  const openLocalShell = useCallback(() => {
    connectHost({ host: LOCAL_SHELL });
  }, [connectHost]);

  const closeSession = useCallback((id) => {
    setOpenSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveSessionId((cur) => (cur === id ? null : cur));
  }, []);

  // Global nav shortcuts (AiSession handles ⌘I / Esc within a session).
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "t") { e.preventDefault(); navigate("servers"); }
      else if (k === "p") { e.preventDefault(); navigate("forwarding"); }
      else if (k === "l") { e.preventDefault(); openLocalShell(); }
      else if (e.key === ",") { e.preventDefault(); setPrefsOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, openLocalShell]);

  const sidebarSessions = openSessions.map((s) => ({
    id: s.id,
    title: s.title,
    status: "connected",
  }));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void text-mist">
      <Sidebar
        activeView={activeSession ? null : activeView}
        onNavigate={navigate}
        sessions={sidebarSessions.length ? sidebarSessions : undefined}
        activeSessionId={activeSessionId}
        onOpenSession={(id) => setActiveSessionId(id)}
        onOpenPrefs={() => setPrefsOpen(true)}
        vault={INV.VAULT.name}
        recent={INV.HISTORY}
        onOpenHistory={() => navigate("history")}
      />

      <main className="relative flex min-w-0 flex-1 flex-col bg-void">
        {activeSession ? (
          <SessionArea
            sessions={openSessions}
            activeId={activeSessionId}
            onFocus={setActiveSessionId}
            onClose={closeSession}
            onNewTab={() => navigate("servers")}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {activeView === "servers" ? (
              <ServersView onConnect={connectHost} />
            ) : activeView === "sftp" ? (
              <SftpView />
            ) : activeView === "forwarding" ? (
              <PortForwardingView />
            ) : (
              <HistoryView onReconnect={reconnectByName} />
            )}
          </div>
        )}
      </main>

      <PreferencesWindow
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        theme={theme}
        setTheme={setTheme}
        font={font}
        setFont={setFont}
        fontSize={fontSize}
        setFontSize={setFontSize}
      />
    </div>
  );
}

/* ---- Session area: tab strip + AiSession workspace ------------------ */

function SessionArea({ sessions, activeId, onFocus, onClose, onNewTab }) {
  const active = sessions.find((s) => s.id === activeId);
  const isDemo = active?.host?.id === "h-web-prod-01";
  const sessionHost = active ? toSessionHost(active.host) : SESSION;
  const timeline = active ? active.timeline : TIMELINE;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionTabs sessions={sessions} activeId={activeId} onFocus={onFocus} onClose={onClose} onNewTab={onNewTab} />
      {active ? (
        <AiSession
          key={active.id}
          host={sessionHost}
          timeline={isDemo ? TIMELINE : timeline}
          initialAiOn={true}
          aiPlacement="sidebar"
        />
      ) : null}
    </div>
  );
}

function SessionTabs({ sessions, activeId, onFocus, onClose, onNewTab }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-graphite bg-carbon px-2">
      <div className="flex items-center gap-1 overflow-x-auto scroll-thin">
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              onClick={() => onFocus(s.id)}
              className={
                "group flex shrink-0 cursor-pointer items-center gap-2 rounded-t-md px-3 py-1.5 text-[12.5px] transition-colors " +
                (active
                  ? "bg-void text-paper shadow-[inset_0_2px_0_#e4f222]"
                  : "border border-transparent text-fog hover:bg-white/5 hover:text-mist")
              }
            >
              <Icon name="terminal" size={13} className={active ? "text-acid-lime" : "text-fog/70"} />
              <span className="max-w-[150px] truncate">{s.title}</span>
              <button
                type="button"
                aria-label={"Close " + s.title}
                onClick={(e) => { e.stopPropagation(); onClose(s.id); }}
                className="grid h-4 w-4 place-items-center rounded text-fog/70 opacity-0 transition-opacity hover:bg-white/10 hover:text-mist group-hover:opacity-100"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="New tab"
        title="New tab (⌘T)"
        onClick={onNewTab}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
      >
        <Icon name="plus" size={15} />
      </button>
    </div>
  );
}

const _root = ReactDOM.createRoot(document.getElementById("root"));
_root.render(<BuzzApp />);
