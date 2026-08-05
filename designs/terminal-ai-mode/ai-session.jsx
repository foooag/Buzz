// ai-session.jsx — AiSession: the connected-session workspace (terminal +
//   AI agent loop + confirm dialog). Shared by index.html (standalone demo)
//   and Buzz.html (full app session view). No auto-mount.
//   State machine: off → idle → streaming → awaiting-confirm → streaming → done | aborted

const { useEffect, useRef, useState, useCallback } = React;
const { Terminal } = window;
const { MessageStream, Composer, ConfirmDialog, HistoryPanel } = window;
const { SESSION, PROVIDER, DEMO_REQUEST, TIMELINE, PROMPT, SCROLLBACK, nextId, buildPrompt, buildScrollback } = window;

/* ---- chat-history storage -------------------------------------------- */

function aiHistoryKey(host) {
  const id = (host && (host.title || host.host)) || "unknown";
  return "buzz.ai-history." + id;
}

function loadAiHistory(host) {
  try {
    const raw = window.localStorage.getItem(aiHistoryKey(host));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAiHistory(host, conversations) {
  try {
    window.localStorage.setItem(aiHistoryKey(host), JSON.stringify(conversations));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

function deriveConversationTitle(messages, fallback = "New chat") {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return fallback;
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? t.slice(0, 60) + "…" : t || fallback;
}

function AiSession({
  host = SESSION,
  timeline = TIMELINE,
  provider = PROVIDER,
  initialAiOn = true,
  onAiToggle,
  aiPlacement = "bottom",
}) {
  const isDemo = host === SESSION || host.title === SESSION.title;
  const sessionPrompt = isDemo ? PROMPT : buildPrompt(host);
  const sessionScrollback = isDemo ? SCROLLBACK : buildScrollback(host);
  // Children (Composer placeholder, CommandCard target, ConfirmDialog) read
  // these globals, so reflect the connected host/provider.
  window.SESSION = host;
  window.PROVIDER = provider;

  const [aiOn, setAiOn] = useState(initialAiOn);
  const [phase, setPhase] = useState("idle"); // idle | streaming | awaiting-confirm | done | aborted
  const [messages, setMessages] = useState([]);
  const [echoBlocks, setEchoBlocks] = useState([]);
  const [input, setInput] = useState(isDemo ? DEMO_REQUEST : "");
  const [confirm, setConfirm] = useState(null); // { id, cmd, verdict } | null

  // Chat history: list of past conversations on this host + the id of the
  // conversation currently shown in the sidebar. The live transcript is
  // persisted into the active conversation (or a new one) on every change.
  const [conversations, setConversations] = useState(() => loadAiHistory(host));
  const [activeConvId, setActiveConvId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const inputRef = useRef(null);
  const timeoutsRef = useRef(new Map());
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);
  const confirmResolverRef = useRef(null);
  // Refs mirror the latest messages/echoBlocks so async turn code can snapshot
  // without re-running effects mid-closure.
  const messagesRef = useRef(messages);
  const echoBlocksRef = useRef(echoBlocks);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { echoBlocksRef.current = echoBlocks; }, [echoBlocks]);

  const busy = phase === "streaming" || phase === "awaiting-confirm";
  const awaitingConfirm = phase === "awaiting-confirm";
  const sidebarAi = aiPlacement === "sidebar";

  /* ---- message / echo mutators ---------------------------------------- */

  const pushMessage = useCallback((m) => {
    setMessages((prev) => [...prev, m]);
  }, []);
  const patchMessage = useCallback((id, patch) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);
  const pushEcho = useCallback((b) => {
    setEchoBlocks((prev) => [...prev, b]);
  }, []);
  const patchEcho = useCallback((id, patch) => {
    setEchoBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  /* ---- cancellation primitives ---------------------------------------- */

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

  /* ---- streaming + exec steps ----------------------------------------- */

  const streamAssistant = async (text) => {
    const id = nextId("msg");
    pushMessage({ id, role: "assistant", text: "", streaming: true });
    const words = text.split(" ");
    let acc = "";
    for (let i = 0; i < words.length; i++) {
      if (cancelledRef.current) break;
      acc += (i ? " " : "") + words[i];
      patchMessage(id, { text: acc });
      await sleep(i % 3 === 0 ? 34 : 20);
    }
    patchMessage(id, { text: acc, streaming: false });
  };

  const runExec = async (seg) => {
    // returns true to continue the timeline, false to stop
    const id = nextId("msg");
    const echoId = nextId("echo");
    const verdict = seg.verdict;
    const card = {
      id,
      role: "tool",
      cmd: seg.cmd,
      status: "pending",
      verdict,
      result: null,
      excerpt: seg.excerpt,
      expanded: false,
      target: host.host,
    };
    pushMessage(card);
    pushEcho({ id: echoId, cmd: seg.cmd, status: "pending", result: null, echoLines: Math.min(seg.excerpt, 5) });

    await sleep(280);
    if (cancelledRef.current) return false;

    if (verdict.allow) {
      patchMessage(id, { status: "running" });
      patchEcho(echoId, { status: "running" });
      await sleep(Math.max(480, Math.min(seg.durationMs, 1400)));
      if (cancelledRef.current) return false;
      const result = { exitCode: seg.exitCode, durationMs: seg.durationMs, full: seg.full };
      patchMessage(id, { status: "done", result });
      patchEcho(echoId, { status: "done", result });
      return true;
    }

    // high-risk → needs confirmation
    setPhase("awaiting-confirm");
    const res = await new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirm({ id, cmd: seg.cmd, verdict });
    });
    if (cancelledRef.current) return false;

    if (res.decision === "run") {
      const cmd = res.editedCmd || seg.cmd;
      if (cmd !== seg.cmd) {
        patchMessage(id, { cmd });
        patchEcho(echoId, { cmd });
      }
      setPhase("streaming");
      patchMessage(id, { status: "running" });
      patchEcho(echoId, { status: "running" });
      await sleep(Math.max(560, Math.min(seg.durationMs, 1700)));
      if (cancelledRef.current) return false;
      const result = { exitCode: seg.exitCode, durationMs: seg.durationMs, full: seg.full };
      patchMessage(id, { status: "done", result });
      patchEcho(echoId, { status: "done", result });
      return true;
    }

    // user declined
    patchMessage(id, { status: "declined" });
    patchEcho(echoId, { status: "declined" });
    setPhase("streaming");
    await streamAssistant(
      "Understood — I won't run that. Want me to check `journalctl -u gunicorn -n 100` for the crash cause instead?",
    );
    return false;
  };

  /* ---- the turn ------------------------------------------------------- */

  const runTurn = async (userText) => {
    cancelledRef.current = false;
    runningRef.current = true;
    setPhase("streaming");
    pushMessage({ id: nextId("msg"), role: "user", text: userText });

    for (const seg of timeline) {
      if (cancelledRef.current) break;
      if (seg.kind === "assistant") {
        await streamAssistant(seg.text);
      } else if (seg.kind === "exec") {
        const cont = await runExec(seg);
        if (!cont) break;
      }
    }

    if (cancelledRef.current) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role === "tool" && (m.status === "pending" || m.status === "running"))
            return { ...m, status: "aborted" };
          if (m.role === "assistant" && m.streaming) return { ...m, streaming: false };
          return m;
        }),
      );
      setEchoBlocks((prev) =>
        prev.map((b) => (b.status === "pending" || b.status === "running" ? { ...b, status: "aborted" } : b)),
      );
      setPhase("aborted");
    } else {
      setPhase("done");
    }
    runningRef.current = false;
  };

  /* ---- actions -------------------------------------------------------- */

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

  /* ---- chat-history persistence + actions ----------------------------- */

  // Persist the live transcript into the active conversation (or create one on
  // the first message of a fresh chat). We track the latest values in refs so
  // a single debounced writer can fire from a mount-only effect — re-running
  // the effect on every messages/echoBlocks change would clear its own timer.
  const activeConvIdRef = useRef(activeConvId);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  useEffect(() => {
    const tick = () => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      const now = Date.now();
      const currentActiveId = activeConvIdRef.current;
      setConversations((prev) => {
        let next;
        if (currentActiveId && prev.some((c) => c.id === currentActiveId)) {
          next = prev.map((c) =>
            c.id === currentActiveId
              ? {
                  ...c,
                  messages: msgs,
                  echoBlocks: echoBlocksRef.current,
                  updatedAt: now,
                  title: c.title || deriveConversationTitle(msgs),
                }
              : c,
          );
        } else {
          const id = nextId("conv");
          const conv = {
            id,
            title: deriveConversationTitle(msgs),
            createdAt: now,
            updatedAt: now,
            messages: msgs,
            echoBlocks: echoBlocksRef.current,
          };
          next = [conv, ...prev];
          setActiveConvId(id);
        }
        saveAiHistory(host, next);
        return next;
      });
    };
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
    // Run for the lifetime of this AiSession — refs carry the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  const startNewChat = useCallback(() => {
    if (runningRef.current) handleAbort();
    setConfirm(null);
    setMessages([]);
    setEchoBlocks([]);
    setActiveConvId(null);
    setPhase("idle");
    cancelledRef.current = false;
    setHistoryOpen(false);
    focusComposer();
  }, []);

  const openConversation = useCallback((id) => {
    if (runningRef.current) handleAbort();
    setConfirm(null);
    const conv = loadAiHistory(host).find((c) => c.id === id);
    if (!conv) return;
    setMessages(conv.messages);
    setEchoBlocks(conv.echoBlocks || []);
    setActiveConvId(id);
    setPhase("done");
    cancelledRef.current = false;
    setHistoryOpen(false);
  }, [host]);

  const deleteConversation = useCallback((id) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveAiHistory(host, next);
      return next;
    });
    if (activeConvId === id) {
      // Deleting the conversation on screen — clear the live transcript too.
      if (runningRef.current) handleAbort();
      setConfirm(null);
      setMessages([]);
      setEchoBlocks([]);
      setActiveConvId(null);
      setPhase("idle");
    }
  }, [activeConvId, host]);

  const renameConversation = useCallback((id, title) => {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, title } : c));
      saveAiHistory(host, next);
      return next;
    });
  }, [host]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => !v);
  }, []);

  const focusComposer = () => {
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const toggleAi = () => {
    if (!aiOn) {
      setAiOn(true);
      setPhase("idle");
      focusComposer();
      onAiToggle?.(true);
      return;
    }
    if (runningRef.current) handleAbort();
    setConfirm(null);
    setMessages([]);
    setEchoBlocks([]);
    setActiveConvId(null);
    setHistoryOpen(false);
    setPhase("off");
    cancelledRef.current = false;
    setAiOn(false);
    onAiToggle?.(false);
  };

  /* ---- global shortcuts: ⌘I + Esc ------------------------------------ */

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        toggleAi();
        return;
      }
      if (e.key === "Escape") {
        if (confirmResolverRef.current) {
          e.preventDefault();
          resolveConfirm("cancel");
          return;
        }
        if (historyOpen) {
          e.preventDefault();
          setHistoryOpen(false);
          return;
        }
        if (runningRef.current) {
          e.preventDefault();
          handleAbort();
          return;
        }
        if (aiOn) {
          e.preventDefault();
          inputRef.current?.blur();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOn, historyOpen]);

  /* -------------------------------------------------------------------- */

  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <Terminal
          host={host}
          prompt={sessionPrompt}
          scrollback={sessionScrollback}
          echoBlocks={echoBlocks}
          aiOn={aiOn}
          onToggleAi={toggleAi}
        />

        {aiOn && sidebarAi ? (
          <aside
            data-screen-label="AI sidebar"
            className="flex w-[376px] shrink-0 flex-col border-l border-graphite bg-carbon xl:w-[400px]"
          >
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-graphite px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
                  <Icon name="sparkles" size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="m-0 text-[13px] font-semibold tracking-tight text-paper">
                      AI Assistant
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
                    <Icon name="server" size={11} />
                    <span className="truncate">{host.user}@{host.host}</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={startNewChat}
                  aria-label="New chat"
                  title="New chat"
                  className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Icon name="plus" size={15} />
                </button>
                <button
                  type="button"
                  onClick={toggleHistory}
                  aria-label="Chat history"
                  aria-pressed={historyOpen}
                  title="Chat history"
                  className={
                    "grid h-7 w-7 place-items-center rounded-md transition-colors " +
                    (historyOpen
                      ? "bg-graphite text-mist"
                      : "text-fog hover:bg-white/5 hover:text-mist")
                  }
                >
                  <Icon name="history" size={14} />
                </button>
                <button
                  type="button"
                  onClick={toggleAi}
                  aria-label="Close AI sidebar"
                  title="Close AI sidebar (⌘I)"
                  className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            {historyOpen ? (
              <HistoryPanel
                conversations={conversations}
                activeId={activeConvId}
                onOpen={openConversation}
                onDelete={deleteConversation}
                onRename={renameConversation}
                onNewChat={startNewChat}
                onClose={() => setHistoryOpen(false)}
              />
            ) : messages.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-acid-lime/20 bg-acid-lime/10 text-acid-lime">
                  <Icon name="sparkles" size={20} />
                </div>
                <h3 className="m-0 mt-4 text-[14px] font-medium text-mist">AI standing by</h3>
                <p className="m-0 mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-fog">
                  Describe a task below and I’ll run it on {host.host}.
                </p>
              </div>
            ) : (
              <MessageStream
                messages={messages}
                onToggleExpand={toggleExpand}
                layout="sidebar"
              />
            )}

            <Composer
              inputRef={inputRef}
              input={input}
              setInput={setInput}
              onSend={handleSend}
              onAbort={handleAbort}
              busy={busy}
              awaitingConfirm={awaitingConfirm}
              layout="sidebar"
            />
          </aside>
        ) : null}
      </div>

      {aiOn && !sidebarAi ? (
        <div className="flex shrink-0 flex-col">
          {messages.length === 0 ? (
            <div className="flex h-9 items-center gap-2 border-t border-graphite bg-carbon px-4 text-[12px] text-fog">
              <span className="standby-dot h-1.5 w-1.5 rounded-full bg-acid-lime" />
              <span className="text-mist">AI standing by</span>
              <span className="text-fog/70">
                — describe a task and I’ll run it on {host.host}.
              </span>
            </div>
          ) : (
            <MessageStream messages={messages} onToggleExpand={toggleExpand} />
          )}
          <Composer
            inputRef={inputRef}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            onAbort={handleAbort}
            busy={busy}
            awaitingConfirm={awaitingConfirm}
          />
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog card={confirm} onResolve={resolveConfirm} />
      ) : null}
    </main>
  );
}

Object.assign(window, { AiSession });
