import {
  AssistantRuntimeProvider,
  type ThreadAssistantMessagePart,
  ThreadPrimitive,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { Bot, Loader2, Plus, Shield, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import type { ModelOption } from "@/components/assistant-ui/model-selector";
import { aiConfigApi } from "@/features/ai/aiApi";
import type {
  AiConfigApi,
  AiProviderConfig,
} from "@/features/ai/aiConfigTypes";
import type { AiAgentMessage } from "@/features/ai/aiAgentTypes";
import {
  aiSessionApi,
  type AiSessionClient,
  type AiSessionSummary,
} from "@/features/ai/aiSessionApi";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import { agentApi } from "./agentApi";
import type {
  AgentClient,
  AgentEvent,
  AgentToolConfirmation,
} from "./agentTypes";
import {
  deriveCredentialHostIds,
  initialHostProgress,
  reduceConfirmation,
  reduceHostProgress,
  type HostProgress,
} from "./agentItems";
import { ConfirmCard } from "./ConfirmCard";
import { HistoryDropdown } from "./HistoryDropdown";
import { HostErrorBanner } from "./HostErrorBanner";
import { AgentMessages } from "./MessageViews";
import { MentionComposer } from "./composer/MentionComposer";
import { groupThoughtParts } from "./messageParts";
import { ProgressPanel } from "./ProgressPanel";
import { useAgentRuntime } from "./useAgentRuntime";

export type AgentPageProps = {
  agentClient?: AgentClient;
  providerApi?: AiConfigApi;
  sessionApi?: AiSessionClient;
  onOpenServers?: () => void;
};

export function AgentPage({
  agentClient = agentApi,
  providerApi = aiConfigApi,
  sessionApi = aiSessionApi,
  onOpenServers = () => undefined,
}: AgentPageProps) {
  const activeVaultId = useInventoryStore((state) => state.activeVaultId);
  const groups = useInventoryStore((state) => state.groups);
  const hosts = useInventoryStore((state) => state.hosts);
  const [providers, setProviders] = useState<AiProviderConfig[] | null>(null);
  const [providerId, setProviderId] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentProviderId, setAgentProviderId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [progress, setProgress] = useState<HostProgress[]>([]);
  const [confirmation, setConfirmation] =
    useState<AgentToolConfirmation | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sessions, setSessions] = useState<AiSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<
    AiAgentMessage[] | null
  >(null);
  const [agentRevision, setAgentRevision] = useState(0);
  const [hasStartedAgent, setHasStartedAgent] = useState(false);

  const groupHosts = useMemo(
    () =>
      Object.fromEntries(
        Object.values(groups)
          .filter((group) => !activeVaultId || group.vaultId === activeVaultId)
          .map((group) => [
            group.id,
            Object.values(hosts)
              .filter((host) => host.groupId === group.id)
              .map((host) => host.id),
          ]),
      ),
    [activeVaultId, groups, hosts],
  );
  const hostLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.values(hosts).map((host) => [host.id, host.name]),
      ),
    [hosts],
  );
  const modelOptions = useMemo<ModelOption[]>(
    () =>
      providers?.map((provider) => ({
        id: provider.id,
        name: provider.modelId || provider.name,
        description: provider.name,
        keywords: [provider.name, provider.providerKind].filter(Boolean),
      })) ?? [],
    [providers],
  );
  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );
  const lastEvent = events.at(-1);
  const isWorking = Boolean(
    lastEvent &&
    lastEvent.type !== "agentEnd" &&
    lastEvent.type !== "historySaveFailed",
  );
  const status = confirmation
    ? { label: "Approval", dot: "bg-coral-red" }
    : isWorking
      ? { label: "Working", dot: "standby-dot bg-acid-lime" }
      : { label: "Ready", dot: "bg-pulse-green" };

  const agentIdRef = useRef<string | null>(null);
  const groupHostsRef =
    useRef<Readonly<Record<string, readonly string[]>>>(groupHosts);
  const vaultIdRef = useRef<string | null>(activeVaultId);
  agentIdRef.current = agentId;
  groupHostsRef.current = groupHosts;
  vaultIdRef.current = activeVaultId;

  const refreshSessions = useCallback(
    () =>
      sessionApi.list().then((items) => {
        setSessions(items.filter((item) => item.sshSessionId === ""));
      }),
    [sessionApi],
  );

  useEffect(() => {
    let cancelled = false;
    void providerApi
      .list()
      .then((items) => {
        if (cancelled) return;
        setProviders(items);
        setProviderId(
          (current) =>
            current ||
            items.find((item) => item.isDefault)?.id ||
            items[0]?.id ||
            "",
        );
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    void refreshSessions().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [providerApi, refreshSessions]);

  useEffect(() => {
    if (!providerId) {
      setAgentId(null);
      return;
    }
    let closed = false;
    let createdAgentId: string | undefined;
    setAgentId(null);
    setCreateError(null);
    setProgress([]);
    setConfirmation(null);
    setEvents([]);
    void agentClient
      .create({
        providerConfigId: providerId,
        ...(activeVaultId ? { vaultId: activeVaultId } : {}),
        ...(activeSessionId ? { historySessionId: activeSessionId } : {}),
        targets: [],
      })
      .then((snapshot) => {
        createdAgentId = snapshot.agentId;
        if (closed) {
          void agentClient.close(snapshot.agentId).catch(() => undefined);
          return;
        }
        setAgentId(snapshot.agentId);
        setAgentProviderId(snapshot.providerConfigId);
        setHasStartedAgent(true);
        setProgress(initialHostProgress(snapshot.hosts));
      })
      .catch(() => {
        if (!closed)
          setCreateError("The operations Agent could not be started.");
      });
    return () => {
      closed = true;
      if (createdAgentId)
        void agentClient.close(createdAgentId).catch(() => undefined);
    };
  }, [activeSessionId, activeVaultId, agentClient, agentRevision, providerId]);

  const sideDispatch = useCallback(
    (event: AgentEvent) => {
      setProgress((current) => reduceHostProgress(current, event));
      setConfirmation((current) => reduceConfirmation(current, event));
      setEvents((current) => [...current.slice(-99), event]);
      if (event.type === "agentEnd")
        void refreshSessions().catch(() => undefined);
    },
    [refreshSessions],
  );
  const credentialHostIds = useMemo(
    () => deriveCredentialHostIds(events),
    [events],
  );

  const startNewTask = useCallback(() => {
    setActiveSessionId(null);
    setHistoryMessages([]);
    setEvents([]);
    setProgress([]);
    setConfirmation(null);
    setAgentRevision((current) => current + 1);
  }, []);

  const loadSession = useCallback(
    (id: string) => {
      void sessionApi.load(id).then((record) => {
        if (
          providers?.some((provider) => provider.id === record.providerConfigId)
        ) {
          setProviderId(record.providerConfigId);
        }
        setActiveSessionId(id);
        setHistoryMessages(record.messages);
        setEvents([]);
        setProgress([]);
        setConfirmation(null);
        setAgentRevision((current) => current + 1);
      });
    },
    [providers, sessionApi],
  );

  const decide = useCallback(
    (approved: boolean) => {
      if (!agentId || !confirmation) return;
      const confirmationId = confirmation.confirmationId;
      setConfirmation(null);
      void agentClient
        .decideTool(agentId, confirmationId, approved)
        .catch(() => undefined);
    },
    [agentClient, agentId, confirmation],
  );

  useEffect(() => {
    if (!confirmation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      decide(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation, decide]);

  if (providers === null) {
    return (
      <CenteredState
        icon={<Loader2 className="spin size-5" />}
        text="Loading Agent…"
      />
    );
  }
  if (providers.length === 0) {
    return (
      <CenteredState
        icon={<Bot className="size-6" />}
        text="Configure an AI provider in Settings before starting Agent."
      />
    );
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-void"
      data-screen-label="Agent view"
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-carbon px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="m-0 text-[13px] font-semibold tracking-tight text-paper">
                    Agent
                  </h1>
                  <span
                    key={status.label}
                    className="inline-flex items-center gap-1 rounded-pill bg-graphite/70 px-1.5 py-0.5 text-[10px] text-fog"
                  >
                    <span className={`size-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                  {activeSession ? (
                    <span
                      className="hidden max-w-[220px] truncate rounded-pill bg-graphite/40 px-1.5 py-0.5 text-[10px] text-fog/90 sm:inline"
                      title={activeSession.title}
                    >
                      {activeSession.title}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fog">
                  <Shield className="size-[11px]" />
                  <span className="truncate">
                    Multi-host ops · headless SSH
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <HistoryDropdown
                sessions={sessions}
                activeId={activeSessionId}
                onLoad={loadSession}
                onNew={startNewTask}
                onDelete={(id) => {
                  void sessionApi.delete(id).then(() => {
                    setSessions((current) =>
                      current.filter((session) => session.id !== id),
                    );
                    if (activeSessionId === id) startNewTask();
                  });
                }}
                onRename={(id, title) => {
                  void sessionApi.rename(id, title).then((renamed) => {
                    setSessions((current) =>
                      current.map((session) =>
                        session.id === id ? renamed : session,
                      ),
                    );
                  });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="New chat"
                aria-label="New Agent task"
                onClick={startNewTask}
                className="size-7 text-fog hover:bg-white/5 hover:text-mist"
              >
                <Plus className="size-[15px]" />
              </Button>
            </div>
          </header>

          {createError && !hasStartedAgent ? (
            <div className="grid min-h-0 flex-1 place-items-center px-8 text-center">
              <p role="alert" className="m-0 text-[12px] text-coral-red">
                {createError}
              </p>
            </div>
          ) : hasStartedAgent ? (
            <>
              {createError ? (
                <p
                  role="alert"
                  className="m-0 border-b border-coral-red/25 bg-coral-red/8 px-4 py-2 text-[11px] text-coral-red"
                >
                  {createError}
                </p>
              ) : null}
              <AgentConversation
                agentClient={agentClient}
                agentIdRef={agentIdRef}
                groupHostsRef={groupHostsRef}
                vaultIdRef={vaultIdRef}
                sideDispatch={sideDispatch}
                historyMessages={historyMessages}
                credentialHostIds={credentialHostIds}
                onOpenServers={onOpenServers}
                modelOptions={modelOptions}
                modelId={providerId}
                onModelChange={setProviderId}
                ready={Boolean(agentId && agentProviderId === providerId)}
              />
            </>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center text-[12px] text-fog">
              <span className="flex items-center gap-2">
                <Loader2 className="spin size-4" /> Starting Agent…
              </span>
            </div>
          )}
        </div>

        {progress.length > 0 ? (
          <ProgressPanel
            hosts={progress}
            hostLabels={hostLabels}
            onConnect={onOpenServers}
          />
        ) : null}
      </div>

      {confirmation ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
          onMouseDown={() => decide(false)}
        >
          <ConfirmCard confirmation={confirmation} onDecide={decide} />
        </div>
      ) : null}
    </div>
  );
}

function AgentConversation({
  agentClient,
  agentIdRef,
  groupHostsRef,
  vaultIdRef,
  sideDispatch,
  historyMessages,
  credentialHostIds,
  onOpenServers,
  modelOptions,
  modelId,
  onModelChange,
  ready,
}: {
  agentClient: AgentClient;
  agentIdRef: RefObject<string | null>;
  groupHostsRef: RefObject<Readonly<Record<string, readonly string[]>>>;
  vaultIdRef: RefObject<string | null>;
  sideDispatch: (event: AgentEvent) => void;
  historyMessages: AiAgentMessage[] | null;
  credentialHostIds: readonly string[];
  onOpenServers: () => void;
  modelOptions: readonly ModelOption[];
  modelId: string;
  onModelChange: (modelId: string) => void;
  ready: boolean;
}) {
  const runtime = useAgentRuntime(
    agentClient,
    agentIdRef,
    groupHostsRef,
    vaultIdRef,
    sideDispatch,
  );
  useEffect(() => {
    if (historyMessages === null) return;
    runtime.thread.reset(toThreadMessages(historyMessages));
  }, [historyMessages, runtime]);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport
          className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-carbon/60 px-4 py-3"
          autoScroll
        >
          <ThreadPrimitive.Empty>
            <div className="flex min-h-full flex-col items-center justify-center px-8 text-center">
              <span className="grid size-11 place-items-center rounded-xl border border-acid-lime/20 bg-acid-lime/10 text-acid-lime">
                <Sparkles className="size-5" />
              </span>
              <h2 className="m-0 mt-4 text-[14px] font-medium text-mist">
                Agent standing by
              </h2>
              <p className="m-0 mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-fog">
                Type <span className="text-acid-lime">@</span> to pick a server
                or group, then describe the ops task — the agent connects
                headlessly and reports progress on the right.
              </p>
            </div>
          </ThreadPrimitive.Empty>
          <div className="flex flex-col gap-3.5">
            <AgentMessages />
          </div>
        </ThreadPrimitive.Viewport>
        <HostErrorBanner
          hostIds={credentialHostIds}
          onConnect={onOpenServers}
        />
        <MentionComposer
          autoFocus
          models={modelOptions}
          modelId={modelId}
          onModelChange={onModelChange}
          ready={ready}
        />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function toThreadMessages(
  messages: readonly AiAgentMessage[],
): ThreadMessageLike[] {
  const result: ThreadMessageLike[] = [];
  let assistantParts: ThreadAssistantMessagePart[] = [];
  const flushAssistant = () => {
    if (assistantParts.length === 0) return;
    result.push({
      role: "assistant",
      content: groupThoughtParts(assistantParts),
    });
    assistantParts = [];
  };

  for (const message of messages) {
    if (message.role === "user") {
      flushAssistant();
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n");
      result.push({ role: "user", content: [{ type: "text", text }] });
      continue;
    }
    if (message.role === "assistant") {
      assistantParts.push(
        ...message.content.flatMap(
          (part): ThreadAssistantMessagePart[] => {
            if (part.type === "text")
              return [{ type: "text" as const, text: part.text }];
            if (part.type === "thinking")
              return [{ type: "reasoning" as const, text: part.thinking }];
            if (part.type === "toolCall")
              return [
                {
                  type: "tool-call" as const,
                  toolCallId: part.id,
                  toolName: part.name,
                  args: (part.arguments ?? {}) as never,
                  argsText: JSON.stringify(part.arguments ?? {}),
                },
              ];
            return [];
          },
        ),
      );
    }
  }
  flushAssistant();
  return result;
}

function CenteredState({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="grid h-full place-items-center bg-void p-8 text-center text-fog">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl border border-graphite bg-carbon text-acid-lime">
          {icon}
        </span>
        <p className="m-0 text-[13px] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
