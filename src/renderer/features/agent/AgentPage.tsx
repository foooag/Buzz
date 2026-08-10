import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  History,
  Plus,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { aiConfigApi } from "@/features/ai/aiApi";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import type { Host } from "@/shared/types";
import { agentApi } from "./agentApi";
import type {
  AgentClient,
  AgentEvent,
  AgentMessage,
  AgentToolConfirmation,
} from "./agentTypes";
import { ConfirmCard } from "./ConfirmCard";
import { MentionComposer } from "./MentionComposer";
import { MessageList } from "./MessageList";
import { HistoryDropdown } from "./HistoryDropdown";
import { HostErrorBanner } from "./HostErrorBanner";
import type { CommandStep, HostProgress } from "./progressTypes";
import { ProgressPanel } from "./ProgressPanel";
import {
  loadActiveIdFromDisk,
  loadSessionsFromDisk,
  normalizeRestoredHosts,
  normalizeRestoredMessages,
  normalizeRestoredPhase,
  saveActiveIdToDisk,
  saveSessionsToDisk,
  sortSessionsByRecent,
  summarizeTitle,
  type AgentSession,
  type AgentSessionPhase,
} from "./sessionStore";
import { useAgentChat } from "./chat/useAgentChat";
import { uiMessageToWire } from "./chat/agentMessageAdapter";

export type AgentPageProps = {
  agentClient?: AgentClient;
  providerApi?: AiConfigApi;
  inventoryApi?: InventoryApi;
  onConnectFromServers?: () => void;
  onRequestPreferences?: () => void;
  providerRevision?: number;
};

export function AgentPage({
  agentClient = agentApi,
  providerApi = aiConfigApi,
  inventoryApi,
  onConnectFromServers,
  onRequestPreferences,
  providerRevision = 0,
}: AgentPageProps) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [providerId, setProviderId] = useState("");
  const promptedForProvidersRef = useRef(false);
  const [hosts, setHosts] = useState<HostProgress[]>([]);
  const [inputText, setInputText] = useState("");
  const [draftNonce, setDraftNonce] = useState<number | undefined>(undefined);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState<AgentToolConfirmation>();
  const streamRef = useRef<HTMLDivElement>(null);
  const hostsRef = useRef<Record<string, Host>>({});
  const groupsById = useInventoryStore((state) => state.groups);
  hostsRef.current = useInventoryStore((state) => state.hosts);
  const inventoryStatus = useInventoryStore((state) => state.status);
  const groups = useMemo(() => Object.values(groupsById), [groupsById]);

  // ----- Chat history: localStorage-backed sessions, one agent per session. -
  const [sessions, setSessions] = useState<AgentSession[]>(() => {
    const fromDisk = loadSessionsFromDisk();
    return fromDisk.length > 0 ? fromDisk : [];
  });
  const sessionsRef = useRef(sessions);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const fromDisk = loadActiveIdFromDisk();
    const list = loadSessionsFromDisk();
    if (fromDisk && list.some((session) => session.id === fromDisk)) {
      return fromDisk;
    }
    return null;
  });
  const activeIdRef = useRef<string | null>(activeId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputTextRef = useRef("");
  const [phase, setPhase] = useState<AgentSessionPhase>("idle");

  const handleInputTextChange = useCallback((text: string) => {
    inputTextRef.current = text;
    setInputText(text);
  }, []);

  const hostName = useCallback(
    (hostId: string) => hostsRef.current[hostId]?.name ?? hostId,
    [],
  );

  const resolveMentionLabel = useCallback(
    (label: string) => {
      const host = Object.values(hostsRef.current).find(
        (candidate) => candidate.name === label,
      );
      if (host) return { type: "host" as const, id: host.id };
      const group = groups.find((candidate) => candidate.name === label);
      if (group) return { type: "group" as const, id: group.id };
      return undefined;
    },
    [groups],
  );

  const getGroupHostIds = useCallback(() => {
    return Object.fromEntries(
      groups.map((group) => [
        group.id,
        Object.values(hostsRef.current)
          .filter((host) => host.groupId === group.id)
          .map((host) => host.id),
      ]),
    );
  }, [groups]);

  const getHosts = useCallback(() => {
    return Object.values(hostsRef.current).map((host) => ({
      id: host.id,
      name: host.name,
      address: host.address,
    }));
  }, []);

  // ----- Side-event handler (touches only hosts/confirmation/error) --------
  const addHostCommand = useCallback(
    (
      hostId: string,
      hostLabel: string,
      command: string,
      commandId: string,
    ) => {
      const step: CommandStep = {
        id: commandId,
        command,
        status: "running",
      };
      setHosts((current) => {
        const existing = current.find((host) => host.hostId === hostId);
        if (!existing) {
          return [...current, {
            hostId,
            hostLabel,
            phase: "connecting",
            commands: [step],
          }];
        }
        return current.map((host) =>
          host.hostId === hostId
            ? { ...host, phase: "working", commands: [...host.commands, step] }
            : host,
        );
      });
      window.setTimeout(() => {
        setHosts((current) =>
          current.map((host) =>
            host.hostId === hostId && host.phase === "connecting"
              ? { ...host, phase: "working" }
              : host,
          ),
        );
      }, 250);
    },
    [],
  );

  const handleConfirmation = useCallback((
    confirmation: AgentToolConfirmation,
  ) => {
    setConfirmation(confirmation);
    setAwaitingConfirm(true);
    setPhase("awaiting-confirm");
    setHosts((current) =>
      current.map((host) =>
        host.hostId === confirmation.hostId
          ? {
              ...host,
              commands: host.commands.map((command) =>
                command.command === confirmation.command
                  ? { ...command, awaitingConfirmation: true }
                  : command,
              ),
            }
          : host,
      ),
    );
  }, []);

  const applySideEvent = useCallback((event: AgentEvent) => {
    debugAgentMessage("receive", event);
    switch (event.type) {
      case "agentStart":
        setPhase("streaming");
        setError(undefined);
        return;
      case "toolStart": {
        if (event.toolName !== "host_exec") return;
        const args = (event.args ?? {}) as { hostId?: string; command?: string };
        const hostId = args.hostId ?? "unknown";
        const hostLabel = hostsRef.current[hostId]?.name ?? hostId;
        const command = args.command ?? "";
        addHostCommand(hostId, hostLabel, command, event.toolCallId);
        return;
      }
      case "toolEnd": {
        const details = resultDetails(event.result);
        const code = errorCode(event.result);
        const failed = event.isError || isNonZeroExit(details?.exitCode);
        const credentialMissing =
          failed && code === "AGENT_HOST_CREDENTIAL_MISSING";
        const declined = failed && code === "AGENT_DECLINED";
        const failureMessage = failed
          ? toolFailureMessage(event.result, details)
          : undefined;
        setHosts((current) =>
          current.map((host) => {
            const commands = host.commands.map((command) =>
              command.id === event.toolCallId
                ? {
                    ...command,
                    status: failed ? "error" as const : "ok" as const,
                    awaitingConfirmation: false,
                    error: failed
                      ? credentialMissing
                        ? "Connection refused — no saved credential."
                        : declined
                          ? "Declined by user."
                          : failureMessage
                      : undefined,
                  }
                : command,
            );
            const hasError = commands.some((command) => command.status === "error");
            const allDone = commands.every(
              (command) => command.status === "ok" || command.status === "error",
            );
            return {
              ...host,
              commands,
              phase: hasError ? "error" : allDone ? "done" : "working",
            };
          }),
        );
        return;
      }
      case "toolConfirmationRequired":
        handleConfirmation(event.confirmation);
        return;
      case "agentEnd":
        setAwaitingConfirm(false);
        setConfirmation(undefined);
        setPhase((current) => current === "streaming" ? "done" : current);
        setHosts((current) =>
          current.map((host) =>
            host.phase === "working" || host.phase === "connecting"
              ? { ...host, phase: "done" }
              : host,
          ),
        );
        return;
      case "historySaveFailed":
        setError("The agent session history could not be saved.");
        return;
      default:
        return;
    }
  }, [addHostCommand, handleConfirmation]);

  const chat = useAgentChat({
    agentClient,
    providerConfigId: providerId || undefined,
    resolveMentionLabel,
    getGroupHostIds,
    getHosts,
    onSideEvent: applySideEvent,
    onComplete: (snapshot) => {
      debugAgentMessage("complete", snapshot);
      if (snapshot.errorMessage) setError(snapshot.errorMessage);
    },
  });

  // ----- Sync chat.error → local error state -------------------------------
  useEffect(() => {
    if (chat.error && chat.status === "error") {
      debugAgentMessage("error", chat.error);
      setError(
        chat.error instanceof Error && chat.error.message.trim()
          ? chat.error.message
          : "The agent request failed.",
      );
    }
  }, [chat.error, chat.status]);

  // Load the usable providers once on mount, and again whenever the provider
  // revision changes.
  useEffect(() => {
    let active = true;
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
        if (usable.length === 0 && !promptedForProvidersRef.current) {
          promptedForProvidersRef.current = true;
          onRequestPreferences?.();
        }
      },
      () => {
        if (active) setError("Could not load AI providers.");
      },
    );
    return () => {
      active = false;
    };
  }, [providerApi, providerRevision, onRequestPreferences]);

  useEffect(() => {
    if (!inventoryApi) return;
    const store = useInventoryStore.getState();
    if (store.status !== "idle") return;
    store.beginLoad();
    void inventoryApi.listVaults().then(
      (vaults) => {
        store.setVaults(vaults);
        const vault = vaults[0];
        if (!vault) {
          store.setResources([], [], []);
          return;
        }
        return Promise.all([
          inventoryApi.listGroups(vault.id),
          inventoryApi.listHosts(vault.id),
          inventoryApi.listIdentities(vault.id),
        ]).then(([groups, hosts, identities]) => {
          store.setResources(groups, hosts, identities);
        });
      },
      () => store.fail("INVENTORY_STORAGE_FAILED"),
    );
  }, [inventoryApi]);

  // Hydrate live conversation state from a stored session record so a reload
  // picks up exactly where the user left off.
  const initialStored = useMemo(() => {
    if (!activeId) return null;
    return sessions.find((session) => session.id === activeId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialStored) {
      chat.loadConversation(normalizeRestoredMessages(initialStored.messages));
      setHosts(normalizeRestoredHosts(initialStored.hosts));
      inputTextRef.current = initialStored.input;
      setInputText(initialStored.input);
      setDraftNonce(Date.now());
      setPhase(normalizeRestoredPhase(initialStored.phase));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [chat.messages]);

  // MessageList uses the same callback for both the context-menu open and the
  // Copy menu item click. This handler reads the live window selection and
  // copies it directly.
  const handleCopySelection = useCallback(() => {
    const stream = streamRef.current;
    const selection = window.getSelection();
    if (!stream || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!stream.contains(range.commonAncestorContainer)) return;
    const text = selection.toString();
    if (text) void copyTextToClipboard(text);
  }, []);

  // ----- Send / abort ------------------------------------------------------
  const handleSend = useCallback(() => {
    const text = inputTextRef.current.trim();
    if (
      !text ||
      chat.status === "streaming" ||
      chat.status === "submitted" ||
      awaitingConfirm ||
      !chat.agentId
    ) {
      return;
    }
    setError(undefined);
    setPhase("streaming");
    debugAgentMessage("send", { agentId: chat.agentId, text });
    chat.sendMessage(text);
    inputTextRef.current = "";
    setInputText("");
  }, [chat, awaitingConfirm]);

  const handleAbort = useCallback(() => {
    chat.stop();
  }, [chat]);

  const resolveConfirmation = useCallback((
    decision: "run" | "cancel",
    command?: string,
  ) => {
    const agentId = chat.agentId;
    if (!confirmation || !agentId) return;
    const current = confirmation;
    setConfirmation(undefined);
    setAwaitingConfirm(false);
    setPhase("streaming");
    void agentClient
      .decideTool(agentId, current.confirmationId, decision === "run", command)
      .catch(() => setError("The confirmation is no longer valid."));
    if (decision === "run" && command && command !== current.command) {
      setHosts((currentHosts) =>
        currentHosts.map((host) =>
          host.hostId === current.hostId
            ? {
                ...host,
                commands: host.commands.map((step) =>
                  step.command === current.command
                    ? { ...step, command }
                    : step,
                ),
              }
            : host,
        ),
      );
    }
  }, [agentClient, chat.agentId, confirmation]);

  // ----- Session lifecycle ------------------------------------------------
  const deriveTitle = useCallback((currentMessages: AgentMessage[]) => {
    const firstUser = currentMessages.find((message) => message.role === "user");
    if (firstUser) {
      return summarizeTitle(wireMessageText(firstUser));
    }
    return summarizeTitle("");
  }, []);

  const persistLiveIntoSession = useCallback(
    (overrides?: Partial<Pick<AgentSession, "messages" | "hosts" | "input" | "phase">>) => {
      const now = new Date().toISOString();
      const wireMessages = overrides?.messages ?? chat.messages.map(uiMessageToWire);
      const snap = {
        messages: wireMessages,
        hosts: overrides?.hosts ?? hosts,
        input: overrides?.input ?? inputTextRef.current,
        phase: overrides?.phase ?? phase,
      };
      const existingId = activeIdRef.current;
      const prev = sessionsRef.current;
      let next: AgentSession[];
      let assignedId = existingId;
      if (existingId && prev.some((session) => session.id === existingId)) {
        next = prev.map((session) =>
          session.id === existingId
            ? {
                ...session,
                ...snap,
                title:
                  session.title === "New task"
                    ? deriveTitle(snap.messages)
                    : session.title,
                updatedAt: now,
              }
            : session,
        );
      } else {
        assignedId = generateId();
        const first: AgentSession = {
          id: assignedId,
          title: deriveTitle(snap.messages),
          createdAt: now,
          updatedAt: now,
          ...snap,
        };
        next = [first, ...prev];
      }
      sessionsRef.current = next;
      saveSessionsToDisk(next);
      setSessions(next);
      if (assignedId && assignedId !== existingId) {
        activeIdRef.current = assignedId;
        setActiveId(assignedId);
        saveActiveIdToDisk(assignedId);
      }
      return assignedId;
    },
    [chat.messages, hosts, phase, deriveTitle],
  );

  const resetLiveState = useCallback(() => {
    setConfirmation(undefined);
    chat.reset();
    setHosts([]);
    setError(undefined);
    setDraftNonce(Date.now());
    inputTextRef.current = "";
    setInputText("");
    setAwaitingConfirm(false);
    setPhase("idle");
  }, [chat]);

  const startNewChat = useCallback(() => {
    const leavingHasContent =
      chat.messages.length > 0 || Boolean(inputTextRef.current.trim());
    if (activeIdRef.current || leavingHasContent) {
      persistLiveIntoSession();
    }
    activeIdRef.current = null;
    setActiveId(null);
    saveActiveIdToDisk(null);
    chat.stop();
    resetLiveState();
    chat.restart();
  }, [chat, persistLiveIntoSession, resetLiveState]);

  const selectSession = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return;
      const leavingHasContent =
        chat.messages.length > 0 || Boolean(inputTextRef.current.trim());
      if (activeIdRef.current || leavingHasContent) {
        persistLiveIntoSession();
      }
      const target = sessions.find((session) => session.id === id);
      if (!target) return;
      activeIdRef.current = id;
      setActiveId(id);
      saveActiveIdToDisk(id);
      inputTextRef.current = target.input;
      setInputText(target.input);
      setDraftNonce(Date.now());
      chat.loadConversation(normalizeRestoredMessages(target.messages));
      setHosts(normalizeRestoredHosts(target.hosts));
      setPhase(normalizeRestoredPhase(target.phase));
      setConfirmation(undefined);
      setError(undefined);
      chat.restart();
    },
    [sessions, chat, persistLiveIntoSession],
  );

  const renameSession = useCallback((id: string, title: string) => {
    const next = sessionsRef.current.map((session) =>
      session.id === id
        ? { ...session, title, updatedAt: new Date().toISOString() }
        : session,
    );
    sessionsRef.current = next;
    saveSessionsToDisk(next);
    setSessions(next);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      const next = sessionsRef.current.filter((session) => session.id !== id);
      sessionsRef.current = next;
      saveSessionsToDisk(next);
      setSessions(next);
      if (activeIdRef.current === id) {
        activeIdRef.current = null;
        setActiveId(null);
        saveActiveIdToDisk(null);
        resetLiveState();
        chat.restart();
      }
    },
    [resetLiveState, chat],
  );

  // Auto-persist the live session whenever the conversation has meaningful
  // content.
  useEffect(() => {
    if (chat.messages.length === 0) return;
    persistLiveIntoSession();
  }, [chat.messages, hosts, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const credentialHostIds = useMemo(() => {
    const ids = new Set<string>();
    const wireMessages = chat.messages.map(uiMessageToWire);
    for (const message of wireMessages) {
      if (message.role !== "assistant") continue;
      for (const part of message.content) {
        if (part.type !== "tool-call") continue;
        if (errorCode(part.result) !== "AGENT_HOST_CREDENTIAL_MISSING") continue;
        const hostId = toolArgs(part).hostId;
        if (hostId) ids.add(hostId);
      }
    }
    return [...ids];
  }, [chat.messages]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const providerLabel = selectedProvider
    ? `${selectedProvider.name} · ${selectedProvider.modelId}`
    : undefined;
  const streaming = chat.status === "streaming" || chat.status === "submitted";
  const statusLabel = awaitingConfirm
    ? "Approval"
    : streaming
      ? "Working"
      : "Ready";

  const activeSession = activeId
    ? sessions.find((session) => session.id === activeId)
    : null;
  const sortedSessions = useMemo(() => sortSessionsByRecent(sessions), [sessions]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-void"
      data-screen-label="Agent view"
      data-testid="agent-page"
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-carbon px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="m-0 text-[13px] font-semibold tracking-tight text-paper">
                    Agent
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog">
                    <span
                      className={
                        "h-1.5 w-1.5 rounded-full " +
                        (awaitingConfirm
                          ? "bg-coral-red"
                          : streaming
                            ? "standby-dot bg-acid-lime"
                            : "bg-pulse-green")
                      }
                    />
                    {statusLabel}
                  </span>
                  {activeSession ? (
                    <span
                      className="hidden max-w-[220px] truncate rounded-full bg-graphite/40 px-1.5 py-0.5 text-[10px] text-fog/90 sm:inline"
                      title={activeSession.title}
                    >
                      {activeSession.title}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fog">
                  <ShieldCheck size={11} />
                  <span className="truncate">Multi-host ops · headless SSH</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                  aria-label="Chat history"
                  aria-expanded={historyOpen}
                  title="Chat history"
                  className={
                    "grid h-7 w-7 place-items-center rounded-md transition-colors " +
                    (historyOpen
                      ? "bg-graphite text-mist"
                      : "text-fog hover:bg-white/5 hover:text-mist")
                  }
                >
                  <History size={15} />
                </button>
                {historyOpen ? (
                  <HistoryDropdown
                    sessions={sortedSessions}
                    activeId={activeId}
                    onSelect={selectSession}
                    onNewChat={startNewChat}
                    onRename={renameSession}
                    onDelete={deleteSession}
                    onClose={() => setHistoryOpen(false)}
                  />
                ) : null}
              </div>
              <button
                type="button"
                onClick={startNewChat}
                aria-label="New chat"
                title="New chat"
                className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {chat.messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-acid-lime/20 bg-acid-lime/10 text-acid-lime">
                <Sparkles size={20} />
              </div>
              <h3 className="m-0 mt-4 text-[14px] font-medium text-mist">
                Agent standing by
              </h3>
              <p className="m-0 mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-fog">
                Type <span className="text-acid-lime">@</span> to pick a server
                or group, then describe the ops task — the agent connects
                headlessly and reports progress on the right.
              </p>
              {error ? (
                <p role="alert" className="mt-3 text-[12px] text-coral-red">
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <MessageList
                messages={chat.messages}
                streaming={streaming}
                streamRef={streamRef}
                onCopySelection={handleCopySelection}
              />
              {credentialHostIds.length > 0 ? (
                <div className="shrink-0 px-4 pb-3">
                  {credentialHostIds.map((hostId) => (
                    <HostErrorBanner
                      key={hostId}
                      hostLabel={hostName(hostId)}
                      onConnect={onConnectFromServers}
                    />
                  ))}
                </div>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="shrink-0 px-4 pb-2 text-[12px] text-coral-red"
                >
                  {error}
                </p>
              ) : null}
            </div>
          )}

          <MentionComposer
            value={inputText}
            onValueChange={handleInputTextChange}
            onSend={handleSend}
            onAbort={handleAbort}
            busy={streaming}
            awaitingConfirm={awaitingConfirm}
            sendDisabled={!chat.agentId}
            providerLabel={providerLabel}
            draftNonce={draftNonce}
            hosts={Object.values(hostsRef.current)}
            groups={groups}
            mentionEnabled={inventoryStatus === "ready"}
          />
        </div>

        {hosts.length > 0 ? (
          <ProgressPanel
            progress={hosts}
            onConnectFromServers={onConnectFromServers}
          />
        ) : null}
      </div>

      {confirmation ? (
        <ConfirmCard
          confirmation={confirmation}
          onResolve={resolveConfirmation}
        />
      ) : null}
    </div>
  );
}

// --- Helpers (ported / retained) ---------------------------------------------

type AgentTextPartWire = Extract<AgentMessage, { role: "assistant" }>["content"][number] extends infer P
  ? P extends { type: "text" }
    ? P
    : never
  : never;

function wireMessageText(message: AgentMessage): string {
  if (message.role === "user") {
    return message.content.map((part) => part.text).join("");
  }
  return message.content
    .filter((part): part is AgentTextPartWire => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toolArgs(part: { args?: unknown }): {
  hostId?: string;
  command?: string;
} {
  if (!part.args || typeof part.args !== "object") return {};
  const args = part.args as Record<string, unknown>;
  return {
    hostId: typeof args.hostId === "string" ? args.hostId : undefined,
    command: typeof args.command === "string" ? args.command : undefined,
  };
}

function resultDetails(
  result: unknown,
): { stdout?: string; stderr?: string; exitCode?: number | null } | undefined {
  if (!result || typeof result !== "object") return undefined;
  const wrapped = (result as { details?: unknown }).details;
  const value = (wrapped && typeof wrapped === "object" ? wrapped : result) as {
    stdout?: unknown;
    stderr?: unknown;
    exitCode?: unknown;
  };
  if (
    typeof value.stdout !== "string" &&
    typeof value.stderr !== "string" &&
    typeof value.exitCode !== "number"
  ) {
    return undefined;
  }
  return {
    stdout: typeof value.stdout === "string" ? value.stdout : undefined,
    stderr: typeof value.stderr === "string" ? value.stderr : undefined,
    exitCode:
      typeof value.exitCode === "number" ? value.exitCode : null,
  };
}

function commandOutput(
  details: ReturnType<typeof resultDetails>,
): string | undefined {
  if (!details) return undefined;
  const parts = [details.stdout, details.stderr]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trimEnd());
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function isNonZeroExit(exitCode: number | null | undefined): boolean {
  return typeof exitCode === "number" && exitCode !== 0;
}

function toolFailureMessage(
  result: unknown,
  details: ReturnType<typeof resultDetails>,
): string {
  return commandOutput(details)
    ?? errorMessage(result)
    ?? (typeof details?.exitCode === "number"
      ? `Command exited with code ${details.exitCode}.`
      : "The command failed without an error message.");
}

function errorCode(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function debugAgentMessage(
  direction: "send" | "receive" | "complete" | "error",
  value: unknown,
): void {
  if (import.meta.env.MODE !== "development") return;
  console.debug(`[agent-page:${direction}]`, redactAgentDebugValue(value));
}

function redactAgentDebugValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactAgentDebugText(value.message),
    };
  }
  try {
    return JSON.parse(JSON.stringify(value, (key, nested) => {
      if (isSensitiveDebugKey(key)) return "[redacted]";
      return typeof nested === "string"
        ? redactAgentDebugText(nested)
        : nested;
    })) as unknown;
  } catch {
    return "[unserializable]";
  }
}

function isSensitiveDebugKey(key: string): boolean {
  return /^(apiKey|password|passphrase|privateKey|credential|credentialRef|secret|token|authorization|thinkingSignature|thoughtSignature)$/i
    .test(key);
}

function redactAgentDebugText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[redacted private key]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted api key]")
    .replace(/\b(password|passphrase|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi,
      "$1=[redacted]");
}
