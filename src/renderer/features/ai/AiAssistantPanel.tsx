import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  CornerDownLeft,
  History,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiConfigApi } from "./aiApi";
import type { AiConfigApi, AiProviderConfig } from "./aiConfigTypes";
import { aiAgentApi, type AiAgentClient } from "./aiAgentApi";
import type {
  AiAgentEvent,
  AiAgentMessage,
  AiAgentSnapshot,
  AiToolConfirmation,
} from "./aiAgentTypes";
import { aiSessionApi, type AiSessionSummary } from "./aiSessionApi";
import { ConversationHistoryPanel } from "./ConversationHistoryPanel";

const AI_SIDEBAR_WIDTH_KEY = "terminus.aiSidebarWidth";
const AI_SIDEBAR_DEFAULT_WIDTH = 376;
const AI_SIDEBAR_MIN_WIDTH = 320;
const AI_SIDEBAR_MAX_WIDTH = 720;
const AI_SIDEBAR_KEYBOARD_STEP = 16;
const AI_SIDEBAR_KEYBOARD_LARGE_STEP = 64;

function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return AI_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(
    AI_SIDEBAR_MAX_WIDTH,
    Math.max(AI_SIDEBAR_MIN_WIDTH, Math.round(value)),
  );
}

function loadAiSidebarWidth(): number {
  if (typeof window === "undefined") return AI_SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(AI_SIDEBAR_WIDTH_KEY);
    if (raw === null || raw === "") return AI_SIDEBAR_DEFAULT_WIDTH;
    return clampSidebarWidth(Number(raw));
  } catch {
    return AI_SIDEBAR_DEFAULT_WIDTH;
  }
}

export type AiAssistantPanelProps = {
  onClose: () => void;
  sshSessionId?: string;
  providerApi?: AiConfigApi;
  agentClient?: AiAgentClient;
};

export function AiAssistantPanel({
  onClose,
  sshSessionId,
  providerApi = aiConfigApi,
  agentClient = aiAgentApi,
}: AiAssistantPanelProps) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [providerId, setProviderId] = useState("");
  const [messages, setMessages] = useState<AiAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(Boolean(sshSessionId));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState<AiToolConfirmation>();
  const [sidebarWidth, setSidebarWidth] = useState<number>(loadAiSidebarWidth);
  const [conversations, setConversations] = useState<AiSessionSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const agentIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore quota / privacy mode errors */
    }
  }, [sidebarWidth]);

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(AI_SIDEBAR_DEFAULT_WIDTH);
  }, []);

  useEffect(() => {
    let active = true;
    if (!sshSessionId) {
      setLoading(false);
      setProviders([]);
      setProviderId("");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void providerApi.list().then(
      (items) => {
        if (!active) return;
        const usable = items.filter(
          (item) => item.credentialConfigured || item.providerKind === "ollama",
        );
        setProviders(usable);
        setProviderId((current) =>
          usable.some((item) => item.id === current)
            ? current
            : (usable.find((item) => item.isDefault)?.id ?? usable[0]?.id ?? ""),
        );
        setError(undefined);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("Could not load AI providers.");
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [providerApi, sshSessionId]);

  const selectedProvider = providers.find((item) => item.id === providerId);
  useEffect(() => {
    if (!selectedProvider || !sshSessionId) {
      agentIdRef.current = undefined;
      return;
    }
    let active = true;
    let createdAgentId: string | undefined;
    agentIdRef.current = undefined;
    setMessages([]);
    setError(undefined);
    setRunning(false);
    setConfirmation(undefined);
    void agentClient.create({ providerConfigId: selectedProvider.id, sshSessionId }).then(
      (snapshot) => {
        createdAgentId = snapshot.agentId;
        if (!active) {
          void agentClient.close(snapshot.agentId);
          return;
        }
        agentIdRef.current = snapshot.agentId;
        applySnapshot(snapshot, setMessages, setRunning, setError);
      },
      () => {
        if (active) setError("The AI agent could not be created.");
      },
    );
    return () => {
      active = false;
      const agentId = createdAgentId ?? agentIdRef.current;
      if (agentId) void agentClient.close(agentId);
      if (agentIdRef.current === agentId) agentIdRef.current = undefined;
    };
  }, [agentClient, selectedProvider, sshSessionId]);

  const loadConversations = useCallback(() => {
    if (!sshSessionId) return;
    void aiSessionApi.list().then(
      (list) => {
        setConversations(list);
      },
      () => {
        /* silent — history is non-critical */
      },
    );
  }, [sshSessionId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const startNewChat = useCallback(() => {
    const agentId = agentIdRef.current;
    if (agentId) void agentClient.abort(agentId);
    setConfirmation(undefined);
    setMessages([]);
    setActiveConvId(null);
    setHistoryOpen(false);
    setError(undefined);
    setInput("");
    setRunning(false);
    if (selectedProvider && sshSessionId) {
      void agentClient.create({ providerConfigId: selectedProvider.id, sshSessionId }).then(
        (snapshot) => {
          agentIdRef.current = snapshot.agentId;
          applySnapshot(snapshot, setMessages, setRunning, setError);
        },
        () => {
          setError("The AI agent could not be created.");
        },
      );
    }
  }, [agentClient, selectedProvider, sshSessionId]);

  const openConversation = useCallback((id: string) => {
    const agentId = agentIdRef.current;
    if (agentId) void agentClient.abort(agentId);
    setConfirmation(undefined);
    setHistoryOpen(false);
    void aiSessionApi.load(id).then(
      (record) => {
        setMessages(record.messages);
        setActiveConvId(id);
        setRunning(false);
        setError(undefined);
        agentIdRef.current = undefined;
      },
      () => {
        setError("Could not load this conversation.");
      },
    );
  }, [agentClient]);

  const deleteConversation = useCallback((id: string) => {
    void aiSessionApi.delete(id).then(
      () => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConvId === id) {
          setMessages([]);
          setActiveConvId(null);
          setRunning(false);
          setError(undefined);
          if (agentIdRef.current) {
            void agentClient.abort(agentIdRef.current);
            agentIdRef.current = undefined;
          }
        }
      },
      () => {
        setError("Could not delete this conversation.");
      },
    );
  }, [activeConvId, agentClient]);

  const renameConversation = useCallback((id: string, title: string) => {
    void aiSessionApi.rename(id, title).then(
      (updated) => {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)),
        );
      },
      () => {
        /* silent */
      },
    );
  }, []);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => !v);
  }, []);

  const busy = running;

  const send = (): void => {
    const text = input.trim();
    const agentId = agentIdRef.current;
    if (!text || !agentId) return;
    setInput("");
    setError(undefined);
    if (running) {
      void agentClient.steer(agentId, text).catch(() => {
        setError("The AI agent could not accept the message.");
      });
      return;
    }
    setRunning(true);
    void agentClient.prompt(agentId, text, (event) => {
      applyAgentEvent(event, setMessages, setRunning, setError, setConfirmation);
    }).then(
      (snapshot) => {
        applySnapshot(snapshot, setMessages, setRunning, setError);
        loadConversations();
      },
      () => {
        setRunning(false);
        setError("The AI request failed.");
      },
    );
  };

  const resolveConfirmation = (approved: boolean): void => {
    const agentId = agentIdRef.current;
    if (confirmation && agentId) {
      void agentClient.decideTool(
        agentId,
        confirmation.confirmationId,
        approved,
      ).catch(() => setError("The AI confirmation is no longer valid."));
    }
    setConfirmation(undefined);
  };

  return (
    <aside
      aria-label="AI Assistant"
      data-screen-label="AI sidebar"
      style={{ width: sidebarWidth }}
      className="relative flex min-h-0 shrink-0 flex-col border-l border-graphite bg-carbon"
    >
      <AiSidebarResizeHandle
        width={sidebarWidth}
        onChange={setSidebarWidth}
        onReset={resetSidebarWidth}
      />
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-graphite px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[13px] font-semibold tracking-tight text-paper">
                AI Assistant
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog">
                <span
                  className={
                    "h-1.5 w-1.5 rounded-full " +
                    (confirmation
                      ? "bg-coral-red"
                      : busy
                        ? "standby-dot bg-acid-lime"
                        : "bg-pulse-green")
                  }
                />
                {confirmation ? "Approval" : busy ? "Working" : "Ready"}
              </span>
            </div>
            <p className="m-0 mt-0.5 text-[11px] text-fog">
              {sshSessionId ? "Linux SSH · Pi Agent" : "Linux SSH session required"}
            </p>
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
            <Plus size={15} />
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
            <History size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI sidebar"
            title="Close AI sidebar"
            className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {historyOpen ? (
        <ConversationHistoryPanel
          conversations={conversations}
          activeId={activeConvId}
          onOpen={openConversation}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onNewChat={startNewChat}
          onClose={() => setHistoryOpen(false)}
        />
      ) : loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-sm text-fog">Loading providers…</p>
        </div>
      ) : !sshSessionId ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState text="AI shell tools are available only for connected Linux SSH sessions." />
        </div>
      ) : providers.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState text="Configure an AI provider in Settings before starting a session." />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-acid-lime/20 bg-acid-lime/10 text-acid-lime">
            <Sparkles size={20} />
          </span>
          <h3 className="m-0 mt-4 text-[14px] font-medium text-mist">AI standing by</h3>
          <p className="m-0 mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-fog">
            Describe a task below and I'll run it on this host.
          </p>
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            {messages.map((message, index) => (
              <MessageView key={`${message.timestamp}-${index}`} message={message} />
            ))}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-coral-red">{error}</p> : null}
        </div>
      )}

      <div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
        <div className="overflow-hidden rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke">
          <textarea
            aria-label="Message AI assistant"
            value={input}
            disabled={!agentIdRef.current}
            placeholder="Describe what you want done on web-prod-01…"
            rows={3}
            className="scroll-thin max-h-32 min-h-[76px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-paper outline-hidden placeholder:text-fog/70 disabled:opacity-50"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t border-graphite/80 px-2.5 py-2">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] text-fog">
              <ShieldCheck size={12} />
              {selectedProvider?.providerKind === "ollama"
                ? "Local · keyless"
                : "Cloud · app vault"}
            </span>
            {busy ? (
              <Button
                type="button"
                variant="ghost"
                aria-label="Abort"
                className="h-7 gap-1.5 border border-coral-red/45 px-2.5 text-[11px] text-coral-red hover:bg-coral-red/12 hover:text-coral-red"
                onClick={() => {
                  const agentId = agentIdRef.current;
                  if (agentId) void agentClient.abort(agentId);
                }}
              >
                <Square size={13} /> Abort
              </Button>
            ) : (
              <Button
                type="button"
                aria-label="Send"
                className="h-7 gap-1.5 px-2.5 text-[11px]"
                disabled={!agentIdRef.current || !input.trim()}
                onClick={send}
              >
                Send <Send size={13} />
              </Button>
            )}
          </div>
        </div>
        {sshSessionId && providers.length > 0 ? (
          <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-[10.5px] text-fog">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Model provider</span>
              <select
                aria-label="Model provider"
                value={providerId}
                disabled={busy}
                onChange={(event) => setProviderId(event.target.value)}
                className="max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-[10.5px] text-mist outline-hidden disabled:cursor-default"
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.modelId}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex shrink-0 items-center gap-1 text-fog">
              <kbd className="rounded border border-graphite bg-obsidian px-1 py-px font-sans text-[10px]">
                <CornerDownLeft size={10} />
              </kbd>
              {busy ? "abort" : "send"}
            </span>
          </div>
        ) : null}
      </div>

      {confirmation ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm shell command" className="absolute inset-0 grid place-items-center bg-black/70 p-5">
          <div className="rounded-xl border border-coral-red/40 bg-obsidian p-4 shadow-xl">
            <div className="flex items-center gap-2 text-coral-red"><AlertTriangle size={16} /> Confirmation required</div>
            <p className="mt-3 text-sm text-mist">{confirmation.reason}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => resolveConfirmation(false)}>Cancel</Button>
              <Button type="button" onClick={() => resolveConfirmation(true)}>Run command</Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function applySnapshot(
  snapshot: AiAgentSnapshot,
  setMessages: Dispatch<SetStateAction<AiAgentMessage[]>>,
  setRunning: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | undefined>>,
): void {
  setMessages(snapshot.messages);
  setRunning(snapshot.status !== "idle");
  setError(snapshot.errorMessage);
}

function applyAgentEvent(
  event: AiAgentEvent,
  setMessages: Dispatch<SetStateAction<AiAgentMessage[]>>,
  setRunning: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | undefined>>,
  setConfirmation: Dispatch<SetStateAction<AiToolConfirmation | undefined>>,
): void {
  switch (event.type) {
    case "agentStart":
      setRunning(true);
      return;
    case "messageStart":
      setMessages((current) => [...current, event.message]);
      return;
    case "messageUpdate":
    case "messageEnd":
      setMessages((current) => [...current.slice(0, -1), event.message]);
      return;
    case "toolConfirmationRequired":
      setConfirmation(event.confirmation);
      return;
    case "agentEnd":
      setConfirmation(undefined);
      applySnapshot(event.snapshot, setMessages, setRunning, setError);
      return;
    case "historySaveFailed":
      setError("The AI session history could not be saved.");
      return;
    default:
      return;
  }
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-8 rounded-lg border border-graphite bg-obsidian/50 p-4 text-sm text-fog">{text}</div>;
}

type AiSidebarResizeHandleProps = {
  width: number;
  onChange: (width: number) => void;
  onReset: () => void;
};

function AiSidebarResizeHandle({ width, onChange, onReset }: AiSidebarResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - event.clientX;
      onChange(clampSidebarWidth(dragRef.current.startWidth + delta));
    };
    const onMouseUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const prevCursor = body.style.cursor;
    const prevSelect = body.style.userSelect;
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = prevCursor;
      body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  const beginDrag = (clientX: number) => {
    dragRef.current = { startX: clientX, startWidth: width };
    setDragging(true);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize AI sidebar"
      aria-orientation="vertical"
      aria-valuemin={AI_SIDEBAR_MIN_WIDTH}
      aria-valuemax={AI_SIDEBAR_MAX_WIDTH}
      aria-valuenow={Math.round(width)}
      data-dragging={dragging || undefined}
      className="absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize select-none outline-hidden before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-graphite before:transition-colors hover:before:bg-acid-lime/70 focus-visible:before:bg-acid-lime/80 data-[dragging=true]:before:bg-acid-lime"
      onMouseDown={(event) => {
        event.preventDefault();
        beginDrag(event.clientX);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        beginDrag(event.clientX);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - event.clientX;
        onChange(clampSidebarWidth(dragRef.current.startWidth + delta));
      }}
      onPointerUp={(event) => {
        if (!dragRef.current) return;
        dragRef.current = null;
        setDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey
          ? AI_SIDEBAR_KEYBOARD_LARGE_STEP
          : AI_SIDEBAR_KEYBOARD_STEP;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(clampSidebarWidth(width + step));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(clampSidebarWidth(width - step));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onReset();
        }
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        onReset();
      }}
    />
  );
}

function MessageView({ message }: { message: AiAgentMessage }) {
  if (message.role === "user") {
    const text = typeof message.content === "string" ? message.content : message.content.map((part) => part.type === "text" ? part.text : "[unsupported content]").join("");
    return <div className="ml-8 rounded-lg bg-graphite/60 px-3 py-2 text-sm text-paper">{text}</div>;
  }
  if (message.role === "toolResult") {
    const text = message.content.map((part) => part.type === "text" ? part.text : "[unsupported content]").join("");
    return <pre className="overflow-x-auto rounded-lg border border-graphite bg-black/40 p-3 text-xs text-mist">{text}</pre>;
  }
  if (message.role !== "assistant" || !("content" in message) || !Array.isArray(message.content)) {
    return null;
  }
  const hasToolCall = message.content.some((part) => part.type === "toolCall");
  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  // Some OpenAI-compatible reasoning models emit a single, incomplete text
  // token immediately before switching to a tool call. Keep it in the agent
  // transcript, but do not present it as a standalone assistant response.
  const hideIncompleteToolPrelude =
    message.stopReason === "toolUse" &&
    hasToolCall &&
    Array.from(text).length <= 1;
  return (
    <div className="min-w-0 space-y-2 text-sm leading-relaxed text-mist">
      {message.content.map((part, index) => {
        if (part.type === "text") {
          if (!part.text.trim() || hideIncompleteToolPrelude) return null;
          return <p key={index} className="whitespace-pre-wrap wrap-break-word">{part.text}</p>;
        }
        if (part.type === "thinking") {
          if (!part.thinking.trim()) return null;
          return <ThinkingBlock key={index} text={part.thinking} />;
        }
        return <div key={index} className="overflow-x-auto whitespace-pre-wrap wrap-break-word rounded border border-graphite bg-obsidian/60 p-2 font-mono text-xs">{part.name}({JSON.stringify(part.arguments)})</div>;
      })}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Keep the details open as streaming updates arrive. Using a ref
  // instead of controlled open/onToggle avoids a race where React's
  // controlled <details> re-close during rapid parent re-renders.
  useEffect(() => {
    if (ref.current && !ref.current.open) {
      ref.current.open = true;
    }
  });

  return (
    <details ref={ref} className="group text-fog" open>
      <summary className="cursor-pointer select-none">Thinking</summary>
      <p className="mt-1 whitespace-pre-wrap wrap-break-word border-l border-graphite pl-3 text-xs leading-relaxed">
        {text}
      </p>
    </details>
  );
}
