import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Copy,
  History,
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  AssistantRuntimeProvider,
  generateId,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DirectiveText } from "@/components/assistant-ui/directive-text";
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
  AgentSnapshot,
  AgentToolConfirmation,
} from "./agentTypes";
import { ConfirmCard } from "./ConfirmCard";
import {
  MentionComposer,
  type MentionComposerDraft,
} from "./composer/MentionComposer";
import {
  expandTargets,
  findReferencedHostIds,
  parseDirectives,
} from "./directiveText";
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

export type AgentPageProps = {
  agentClient?: AgentClient;
  providerApi?: AiConfigApi;
  inventoryApi?: InventoryApi;
  onConnectFromServers?: () => void;
  onRequestPreferences?: () => void;
  providerRevision?: number;
};

type AgentMessagePart = Exclude<AgentMessage["content"], string>[number];
type AgentToolCallPart = Extract<AgentMessagePart, { type: "tool-call" }>;

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
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [hosts, setHosts] = useState<HostProgress[]>([]);
  const [agentId, setAgentId] = useState<string>();
  const [draft, setDraft] = useState<MentionComposerDraft>();
  const [running, setRunning] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState<AgentToolConfirmation>();
  const agentIdRef = useRef<string | undefined>(undefined);
  const sendingRef = useRef(false);
  const abortedRef = useRef(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const hostsRef = useRef<Record<string, Host>>({});
  const groupsById = useInventoryStore((state) => state.groups);
  hostsRef.current = useInventoryStore((state) => state.hosts);
  const groups = useMemo(() => Object.values(groupsById), [groupsById]);

  // ----- Chat history: localStorage-backed sessions, one agent per session. -
  // sessions lives both in state (rendering) and a ref (synchronous access for
  // persistence). activeIdRef is the source of truth during the persist cycle —
  // it is set in the same tick that setActiveId is queued, so callbacks never
  // wait for a React flush.
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
    return null; // null = a fresh, unsaved scratch session
  });
  const activeIdRef = useRef<string | null>(activeId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputTextRef = useRef("");
  const [selectedChatText, setSelectedChatText] = useState("");

  const handleInputTextChange = useCallback((text: string) => {
    inputTextRef.current = text;
  }, []);

  // Hydrate live conversation state from a stored session record so a reload
  // picks up exactly where the user left off.
  const initialStored = useMemo(() => {
    if (!activeId) return null;
    return sessions.find((session) => session.id === activeId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [phase, setPhase] = useState<AgentSessionPhase>(() =>
    normalizeRestoredPhase(initialStored?.phase),
  );
  useEffect(() => {
    if (initialStored) {
      setMessages(normalizeRestoredMessages(initialStored.messages));
      setHosts(normalizeRestoredHosts(initialStored.hosts));
      inputTextRef.current = initialStored.input;
      setDraft({ text: initialStored.input, nonce: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Load the usable providers once on mount, and again whenever the provider
  // revision changes (bumped when preferences close — the list may have changed
  // while they were open). Only the first successful load prompts for setup.
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

  const createAgent = useCallback(() => {
    if (!providerId) return;
    const previous = agentIdRef.current;
    if (previous) void agentClient.close(previous).catch(() => undefined);
    void agentClient.create({ providerConfigId: providerId }).then(
      (snapshot) => {
        agentIdRef.current = snapshot.agentId;
        setAgentId(snapshot.agentId);
      },
      () => setError("The agent could not be created."),
    );
  }, [agentClient, providerId]);

  useEffect(() => {
    createAgent();
    return () => {
      const activeAgentId = agentIdRef.current;
      if (activeAgentId) {
        void agentClient.close(activeAgentId).catch(() => undefined);
      }
      agentIdRef.current = undefined;
      setAgentId(undefined);
    };
  }, [agentClient, createAgent]);

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

  useEffect(() => {
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [messages]);

  const captureChatSelection = useCallback(() => {
    const stream = streamRef.current;
    const selection = window.getSelection();
    if (!stream || !selection || selection.rangeCount === 0) {
      setSelectedChatText("");
      return;
    }
    const range = selection.getRangeAt(0);
    const selectedInsideChat = stream.contains(range.commonAncestorContainer);
    setSelectedChatText(selectedInsideChat ? selection.toString() : "");
  }, []);

  const copySelectedChatText = useCallback(() => {
    if (!selectedChatText) return;
    void copyTextToClipboard(selectedChatText);
  }, [selectedChatText]);

  const upsertMessage = useCallback((message: AgentMessage) => {
    setMessages((current) => upsertMessages(current, [message]));
  }, []);

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

  const handleToolStart = useCallback((event: Extract<AgentEvent, { type: "toolStart" }>) => {
    if (event.toolName !== "host_exec") return;
    const args = (event.args ?? {}) as { hostId?: string; command?: string };
    const hostId = args.hostId ?? "unknown";
    const hostLabel = hostName(hostId);
    const command = args.command ?? "";
    setMessages((current) => patchToolCall(current, event.toolCallId, (part) => ({
      ...part,
      timing: { startedAt: Date.now() },
    })));
    addHostCommand(hostId, hostLabel, command, event.toolCallId);
  }, [addHostCommand, hostName]);

  const handleToolEnd = useCallback((event: Extract<AgentEvent, { type: "toolEnd" }>) => {
    const details = resultDetails(event.result);
    const code = errorCode(event.result);
    const failed = event.isError || isNonZeroExit(details?.exitCode);
    const credentialMissing =
      failed && code === "AGENT_HOST_CREDENTIAL_MISSING";
    const declined = failed && code === "AGENT_DECLINED";
    const failureMessage = failed
      ? toolFailureMessage(event.result, details)
      : undefined;
    setMessages((current) => patchToolCall(current, event.toolCallId, (part) => ({
      ...part,
      result: event.result,
      isError: failed,
      timing: {
        startedAt: part.timing?.startedAt ?? Date.now(),
        completedAt: Date.now(),
      },
    })));
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
  }, []);

  const handleConfirmation = useCallback((
    confirmation: AgentToolConfirmation,
  ) => {
    setConfirmation(confirmation);
    setAwaitingConfirm(true);
    setPhase("awaiting-confirm");
    setMessages((current) => patchMatchingToolCall(
      current,
      confirmation.hostId,
      confirmation.command,
      (part) => ({
        ...part,
        approval: {
          id: confirmation.confirmationId,
          reason: confirmation.reason,
          isAutomatic: false,
        },
      }),
    ));
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

  const applySnapshot = useCallback((snapshot: AgentSnapshot) => {
    setRunning(snapshot.status !== "idle");
    setError(snapshot.errorMessage);
    setMessages((current) => upsertMessages(
      current,
      snapshot.messages.filter((message) => message.role === "assistant"),
    ));
  }, []);

  const applyEvent = useCallback((event: AgentEvent) => {
    debugAgentMessage("receive", event);
    switch (event.type) {
      case "agentStart":
        setRunning(true);
        setPhase("streaming");
        setError(undefined);
        return;
      case "messageStart":
      case "messageUpdate":
      case "messageEnd":
        upsertMessage(event.message);
        return;
      case "toolStart":
        handleToolStart(event);
        return;
      case "toolUpdate":
        return;
      case "toolEnd":
        handleToolEnd(event);
        return;
      case "toolConfirmationRequired":
        handleConfirmation(event.confirmation);
        return;
      case "agentEnd":
        applySnapshot(event.snapshot);
        setAwaitingConfirm(false);
        setConfirmation(undefined);
        setPhase(abortedRef.current ? "aborted" : "done");
        setHosts((current) =>
          current.map((host) => {
            if (abortedRef.current) {
              return {
                ...host,
                phase: host.phase === "working" || host.phase === "connecting"
                  ? "aborted"
                  : host.phase,
              };
            }
            return host.phase === "working" || host.phase === "connecting"
              ? { ...host, phase: "done" }
              : host;
          }),
        );
        if (abortedRef.current) {
          setMessages((current) => current.map((message) =>
            message.role !== "assistant"
              ? message
              : {
                  ...message,
                  status: message.status?.type === "running"
                    ? { type: "incomplete", reason: "cancelled" }
                    : message.status,
                },
          ));
          abortedRef.current = false;
        }
        return;
      case "historySaveFailed":
        setError("The agent session history could not be saved.");
        return;
      default:
        return;
    }
  }, [
    applySnapshot,
    handleConfirmation,
    handleToolEnd,
    handleToolStart,
    upsertMessage,
  ]);

  const runPrompt = useCallback(async (text: string) => {
    const trimmed = text.trim();
    const activeAgentId = agentIdRef.current;
    if (!trimmed || sendingRef.current || running || !activeAgentId) {
      if (trimmed && !activeAgentId) {
        setError("Configure an AI provider in Settings to enable the agent.");
      }
      return;
    }
    sendingRef.current = true;
    setError(undefined);
    setAwaitingConfirm(false);
    abortedRef.current = false;
    setMessages((current) => [...current, {
      id: generateId(),
      role: "user",
      content: [{ type: "text", text: trimmed }],
    }]);
    setRunning(true);
    setPhase("streaming");
    const directives = parseDirectives(trimmed, resolveMentionLabel);
    const groupHosts = Object.fromEntries(
      groups.map((group) => [
        group.id,
        Object.values(hostsRef.current)
          .filter((host) => host.groupId === group.id)
          .map((host) => host.id),
      ]),
    );
    const explicitTargets = expandTargets(directives, groupHosts);
    const referencedTargets = findReferencedHostIds(
      trimmed,
      Object.values(hostsRef.current),
    );
    const targets = [...new Set([...explicitTargets, ...referencedTargets])];
    debugAgentMessage("send", {
      agentId: activeAgentId,
      text: trimmed,
      targets,
    });
    try {
      const snapshot = await agentClient.prompt(
        activeAgentId,
        trimmed,
        targets,
        applyEvent,
      );
      debugAgentMessage("complete", snapshot);
      applySnapshot(snapshot);
    } catch (caught) {
      setRunning(false);
      debugAgentMessage("error", caught);
      setError(caught instanceof Error && caught.message.trim()
        ? caught.message
        : "The agent request failed.");
    } finally {
      sendingRef.current = false;
    }
  }, [agentClient, applyEvent, applySnapshot, groups, resolveMentionLabel, running]);

  const handleAbort = useCallback(() => {
    const agentId = agentIdRef.current;
    if (!agentId) return;
    abortedRef.current = true;
    void agentClient.abort(agentId).catch(() => undefined);
  }, [agentClient]);

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: convertAgentMessage,
    isRunning: running,
    isDisabled: awaitingConfirm,
    isSendDisabled: running || awaitingConfirm || !agentId,
    onNew: async (message) => {
      await runPrompt(appendMessageText(message));
    },
    onCancel: async () => {
      handleAbort();
    },
  });

  const resolveConfirmation = useCallback((
    decision: "run" | "cancel",
    command?: string,
  ) => {
    const agentId = agentIdRef.current;
    if (!confirmation || !agentId) return;
    const current = confirmation;
    setConfirmation(undefined);
    setAwaitingConfirm(false);
    setPhase("streaming");
    void agentClient
      .decideTool(agentId, current.confirmationId, decision === "run", command)
      .catch(() => setError("The confirmation is no longer valid."));
    if (decision === "run" && command && command !== current.command) {
      setMessages((messages) => patchMatchingToolCall(
        messages,
        current.hostId,
        current.command,
        (part) => ({
          ...part,
          args: { ...part.args, command },
          argsText: JSON.stringify({ ...part.args, command }),
        }),
      ));
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
  }, [agentClient, confirmation]);

  // ----- Session lifecycle ------------------------------------------------
  // persistLiveIntoSession writes the current live conversation (messages, hosts,
  // composer draft, phase) into the active session record, creating one when
  // needed. It is fully imperative — mutates sessionsRef synchronously, then
  // mirrors into setSessions so React re-renders — so the "create vs update"
  // decision never waits on a setState flush.
  const persistLiveIntoSession = useCallback(
    (overrides?: Partial<Pick<AgentSession, "messages" | "hosts" | "input" | "phase">>) => {
      const now = new Date().toISOString();
      const snap = {
        messages: overrides?.messages ?? messages,
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
                // Auto-title a fresh chat from its first user message, but
                // preserve a manual rename (or an already-derived title).
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
    [messages, hosts, phase],
  );

  const deriveTitle = useCallback((currentMessages: AgentMessage[]) => {
    const firstUser = currentMessages.find((message) => message.role === "user");
    if (firstUser) {
      return summarizeTitle(messageText(firstUser));
    }
    return summarizeTitle("");
  }, []);

  // Reset the live conversation without touching persisted sessions.
  const resetLiveState = useCallback(() => {
    setConfirmation(undefined);
    setMessages([]);
    setHosts([]);
    setError(undefined);
    setDraft({ text: "", nonce: Date.now() });
    inputTextRef.current = "";
    setRunning(false);
    setAwaitingConfirm(false);
    setPhase("idle");
  }, []);

  // Refresh the backend agent so its own history starts clean for the next task.
  const restartAgent = useCallback(() => {
    const currentAgentId = agentIdRef.current;
    if (currentAgentId) void agentClient.close(currentAgentId).catch(() => undefined);
    agentIdRef.current = undefined;
    setAgentId(undefined);
    createAgent();
  }, [agentClient, createAgent]);

  // New chat: persist anything meaningful from the conversation we're leaving,
  // then reset to a fresh, unsaved scratch session with its own agent.
  const startNewChat = useCallback(() => {
    const leavingHasContent =
      messages.length > 0 || Boolean(inputTextRef.current.trim());
    if (activeIdRef.current || leavingHasContent) {
      persistLiveIntoSession();
    }
    activeIdRef.current = null;
    setActiveId(null);
    saveActiveIdToDisk(null);
    const currentAgentId = agentIdRef.current;
    if (currentAgentId) void agentClient.abort(currentAgentId).catch(() => undefined);
    resetLiveState();
    restartAgent();
  }, [
    messages.length,
    persistLiveIntoSession,
    resetLiveState,
    restartAgent,
    agentClient,
  ]);

  // Switch to a stored session (persisting the current one first).
  const selectSession = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return;
      const leavingHasContent =
        messages.length > 0 || Boolean(inputTextRef.current.trim());
      if (activeIdRef.current || leavingHasContent) {
        persistLiveIntoSession();
      }
      const target = sessions.find((session) => session.id === id);
      if (!target) return;
      activeIdRef.current = id;
      setActiveId(id);
      saveActiveIdToDisk(id);
      inputTextRef.current = target.input;
      setMessages(normalizeRestoredMessages(target.messages));
      setHosts(normalizeRestoredHosts(target.hosts));
      setPhase(normalizeRestoredPhase(target.phase));
      setConfirmation(undefined);
      setDraft({ text: target.input, nonce: Date.now() });
      setError(undefined);
      restartAgent();
    },
    [
      sessions,
      messages.length,
      persistLiveIntoSession,
      restartAgent,
    ],
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
        restartAgent();
      }
    },
    [resetLiveState, restartAgent],
  );

  // Auto-persist the live session whenever the conversation has meaningful
  // content. The very first paint (a scratch chat with no user input yet) is
  // skipped so a session record only materialises once the user engages.
  useEffect(() => {
    if (messages.length === 0) return;
    persistLiveIntoSession();
  }, [messages, hosts, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const credentialHostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.role !== "assistant" || typeof message.content === "string") continue;
      for (const part of message.content) {
        if (part.type !== "tool-call" || errorCode(part.result) !== "AGENT_HOST_CREDENTIAL_MISSING") {
          continue;
        }
        const hostId = toolArgs(part).hostId;
        if (hostId) ids.add(hostId);
      }
    }
    return [...ids];
  }, [messages]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const providerLabel = selectedProvider
    ? `${selectedProvider.name} · ${selectedProvider.modelId}`
    : undefined;
  const statusLabel = awaitingConfirm
    ? "Approval"
    : running
      ? "Working"
      : "Ready";

  const activeSession = activeId
    ? sessions.find((session) => session.id === activeId)
    : null;
  const sortedSessions = useMemo(() => sortSessionsByRecent(sessions), [sessions]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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
                            : running
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

            {messages.length === 0 ? (
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
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      ref={streamRef}
                      className="scroll-thin min-h-0 flex-1 select-text overflow-y-auto bg-carbon/60 px-4 py-3"
                      onContextMenu={captureChatSelection}
                    >
                      <div className="flex flex-col gap-3.5">
                        {messages.map((message) => (
                          <AgentMessageView key={message.id} message={message} />
                        ))}
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    <ContextMenuItem
                      disabled={!selectedChatText}
                      onSelect={copySelectedChatText}
                    >
                      <Copy size={14} />
                      Copy
                      <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
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
              onAbort={handleAbort}
              onTextChange={handleInputTextChange}
              busy={running}
              awaitingConfirm={awaitingConfirm}
              providerLabel={providerLabel}
              draft={draft}
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
    </AssistantRuntimeProvider>
  );
}

function AgentMessageView({
  message,
}: {
  message: AgentMessage;
}) {
  if (message.role === "user") {
    const text = messageText(message);
    return (
      <div className="rise-in flex gap-2.5">
        <AgentAvatar label="U" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-fog">You</div>
          <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            <DirectiveText
              type="text"
              text={text}
              status={{ type: "complete" }}
            />
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
          {message.content.map((part, index) => {
            if (part.type === "text") {
              // Remount growing stream parts so Chromium commits every cumulative
              // token update instead of occasionally retaining the first text node.
              return (
                <AgentTextPart
                  key={`${index}:text:${part.text.length}`}
                  text={part.text}
                  status={part.status}
                />
              );
            }
            if (part.type === "reasoning") {
              return (
                <AgentReasoningPart
                  key={`${index}:reasoning:${part.text.length}`}
                  text={part.text}
                  status={part.status}
                />
              );
            }
            if (part.type === "tool-call") {
              return (
                <AgentToolCallPart
                  key={part.toolCallId}
                  part={part}
                  messageStatus={message.status}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  }
  return null;
}

function AgentTextPart({
  text,
  status,
}: Pick<Extract<AgentMessagePart, { type: "text" }>, "text" | "status">) {
  if (!text) return null;
  return (
    <div
      className={
        "mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-mist " +
        (status?.type === "running" ? "stream-caret" : "")
      }
    >
      {text}
    </div>
  );
}

function AgentReasoningPart({
  text,
  status,
}: Pick<Extract<AgentMessagePart, { type: "reasoning" }>, "text" | "status">) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.open = true;
  }, [text]);

  return (
    <details ref={ref} className="group mt-1 text-fog" open>
      <summary className="cursor-pointer select-none text-[11px]">
        Thinking
      </summary>
      <div
        className={
          "mt-1 whitespace-pre-wrap break-words border-l border-graphite pl-3 text-[12px] leading-relaxed " +
          (status?.type === "running" ? "stream-caret" : "")
        }
      >
        {text}
      </div>
    </details>
  );
}

function AgentAvatar({ tone, label }: { tone?: "ai"; label?: string }) {
  if (tone === "ai") {
    return (
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-acid-lime/12 text-acid-lime">
        <Sparkles size={13} />
      </div>
    );
  }
  return (
    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-graphite text-[10px] font-semibold text-mist">
      {label ?? "U"}
    </div>
  );
}

function VerdictChip({ allow }: { allow: boolean }) {
  return allow ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-pulse-green/12 px-2 py-0.5 text-[11px] font-medium text-pulse-green">
      <span className="h-1.5 w-1.5 rounded-full bg-pulse-green" />
      auto-run
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-red/12 px-2 py-0.5 text-[11px] font-medium text-coral-red">
      <span className="h-1.5 w-1.5 rounded-full bg-coral-red" />
      high risk
    </span>
  );
}

type AgentToolViewStatus =
  | "running"
  | "done"
  | "error"
  | "credential-missing"
  | "declined"
  | "aborted";

function AgentStatusBadge({
  status,
  exitCode,
}: {
  status: AgentToolViewStatus;
  exitCode?: number | null;
}) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-mist">
        <span className="spin h-3 w-3 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
        running
      </span>
    );
  }
  if (status === "credential-missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        needs credential
      </span>
    );
  }
  if (status === "declined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        declined
      </span>
    );
  }
  if (status === "aborted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-graphite px-2 py-0.5 text-[11px] text-fog">
        aborted
      </span>
    );
  }
  const ok = status === "done" && (exitCode === 0 || exitCode == null);
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (ok
          ? "bg-pulse-green/12 text-pulse-green"
          : "bg-coral-red/12 text-coral-red")
      }
    >
      {ok ? <Check size={12} /> : <X size={12} />}
      {status === "done"
        ? `exit ${exitCode ?? "—"}`
        : "failed"}
    </span>
  );
}

function AgentToolCallPart({
  part,
  messageStatus,
}: {
  part: AgentToolCallPart;
  messageStatus: Extract<AgentMessage, { role: "assistant" }>["status"];
}) {
  const { toolName, args, result, isError, timing, approval } = part;
  const [expanded, setExpanded] = useState(false);
  const parsedArgs = toolArgs({ args });
  const hostId = parsedArgs.hostId ?? "unknown";
  const hostLabel = useInventoryStore(
    (state) => state.hosts[hostId]?.name ?? hostId,
  );
  const details = resultDetails(result);
  const code = errorCode(result);
  const failed = Boolean(isError) || isNonZeroExit(details?.exitCode);
  const status: AgentToolViewStatus = code === "AGENT_HOST_CREDENTIAL_MISSING"
    ? "credential-missing"
    : code === "AGENT_DECLINED"
      ? "declined"
      : messageStatus.type === "incomplete" && messageStatus.reason === "cancelled"
        ? "aborted"
        : result === undefined
          ? "running"
          : failed
            ? "error"
            : "done";
  const failureMessage = failed ? toolFailureMessage(result, details) : undefined;
  const output = commandOutput(details) ?? failureMessage;
  const lines = output ? output.split("\n").filter(Boolean) : [];
  const excerpt = 5;
  const showExpand = lines.length > excerpt;
  const visible = expanded ? lines : lines.slice(0, excerpt);
  const durationMs = timing?.completedAt === undefined
    ? undefined
    : timing.completedAt - timing.startedAt;
  return (
    <div className="rise-in overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <VerdictChip allow={!approval || approval.isAutomatic === true} />
        <AgentStatusBadge status={status} exitCode={details?.exitCode} />
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-start gap-2 font-mono text-[12.5px] leading-relaxed text-mist">
          <span className="select-none text-fog">$</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {parsedArgs.command ?? toolName}
          </span>
        </div>
      </div>

      {status === "running" ? (
        <div className="mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-fog">
          <span className="c-dim">capturing output…</span>
        </div>
      ) : lines.length > 0 ? (
        <div
          className={
            "mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed " +
            (failed ? "text-coral-red/90" : "text-mist/90")
          }
        >
          {visible.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-graphite/70 px-3 py-1.5 text-[11px] text-fog">
        <div className="flex min-w-0 items-center gap-2">
          {durationMs !== undefined && status === "done" ? (
            <span className="shrink-0">{formatDuration(durationMs)}</span>
          ) : null}
          <span className="inline-flex min-w-0 items-center gap-1">
            <Server size={11} className="shrink-0" />
            <span className="truncate">{hostLabel}</span>
          </span>
        </div>
        {showExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex shrink-0 items-center gap-1 rounded text-fog transition-colors hover:text-mist"
          >
            <ChevronDown size={12} className={expanded ? "rotate-180" : ""} />
            {expanded
              ? "Show less"
              : `Expand (${lines.length - excerpt} more)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function appendMessageText(message: AppendMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function convertAgentMessage(message: AgentMessage): ThreadMessageLike {
  return message;
}

function upsertMessages(
  current: AgentMessage[],
  incoming: AgentMessage[],
): AgentMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(incoming.map((message) => [message.id, message]));
  const existingIds = new Set(current.map((message) => message.id));
  return [
    ...current.map((message) => byId.get(message.id) ?? message),
    ...incoming.filter((message) => !existingIds.has(message.id)),
  ];
}

function patchToolCall(
  messages: AgentMessage[],
  toolCallId: string,
  patch: (part: AgentToolCallPart) => AgentToolCallPart,
): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") {
      return message;
    }
    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "tool-call" || part.toolCallId !== toolCallId) return part;
      changed = true;
      return patch(part);
    });
    return changed ? { ...message, content } : message;
  });
}

function patchMatchingToolCall(
  messages: AgentMessage[],
  hostId: string | undefined,
  command: string | undefined,
  patch: (part: AgentToolCallPart) => AgentToolCallPart,
): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") {
      return message;
    }
    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "tool-call") return part;
      const args = toolArgs(part);
      if (args.hostId !== hostId || args.command !== command) return part;
      changed = true;
      return patch(part);
    });
    return changed ? { ...message, content } : message;
  });
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

function messageText(message: Pick<ThreadMessageLike, "content">): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
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
