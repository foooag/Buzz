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
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type MessageState,
  type ThreadMessageLike,
} from "@assistant-ui/react";
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
import { expandTargets, parseDirectives } from "./directiveText";
import { HostErrorBanner } from "./HostErrorBanner";
import type { CommandStep, HostProgress } from "./progressTypes";
import { ProgressPanel } from "./ProgressPanel";

type ToolStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "credential-missing"
  | "declined"
  | "aborted";

type ToolCardItem = {
  id: string;
  kind: "tool";
  toolCallId: string;
  cmd: string;
  hostId: string;
  hostLabel: string;
  verdict: { allow: boolean };
  status: ToolStatus;
  exitCode?: number | null;
  durationMs?: number;
  output?: string;
  startedAt?: number;
  expanded: boolean;
  errorMessage?: string;
};

type MessageItem = {
  id: string;
  kind: "user" | "assistant";
  text: string;
  streaming?: boolean;
};

type AgentItem = MessageItem | ToolCardItem;

let itemSeq = 0;
function nextId(prefix: string): string {
  itemSeq += 1;
  return `${prefix}-${Date.now()}-${itemSeq}`;
}

export type AgentPageProps = {
  agentClient?: AgentClient;
  providerApi?: AiConfigApi;
  inventoryApi?: InventoryApi;
  onConnectFromServers?: () => void;
  onRequestPreferences?: () => void;
};

export function AgentPage({
  agentClient = agentApi,
  providerApi = aiConfigApi,
  inventoryApi,
  onConnectFromServers,
  onRequestPreferences,
}: AgentPageProps) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [providerId, setProviderId] = useState("");
  const [items, setItems] = useState<AgentItem[]>([]);
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
        if (usable.length === 0) onRequestPreferences?.();
      },
      () => {
        if (active) setError("Could not load AI providers.");
      },
    );
    return () => {
      active = false;
    };
  }, [providerApi, onRequestPreferences]);

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
  }, [items]);

  const pushMessageItem = useCallback((message: AgentMessage) => {
    if (message.role !== "assistant") return;
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    setItems((current) => [...current, {
      id: nextId("msg"),
      kind: "assistant",
      text,
      streaming: true,
    }]);
  }, []);

  const patchAssistant = useCallback((message: AgentMessage, streaming: boolean) => {
    if (message.role !== "assistant") return;
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    setItems((current) => {
      const index = findLastIndex(current, (item) => item.kind === "assistant");
      if (index === -1) {
        return [...current, {
          id: nextId("msg"),
          kind: "assistant",
          text,
          streaming,
        }];
      }
      return current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, text, streaming }
          : item,
      );
    });
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
    setItems((current) => [...current, {
      id: nextId("msg"),
      kind: "tool",
      toolCallId: event.toolCallId,
      cmd: command,
      hostId,
      hostLabel,
      verdict: { allow: true },
      status: "running",
      startedAt: Date.now(),
      expanded: false,
    }]);
    addHostCommand(hostId, hostLabel, command, event.toolCallId);
  }, [addHostCommand, hostName]);

  const handleToolEnd = useCallback((event: Extract<AgentEvent, { type: "toolEnd" }>) => {
    const details = resultDetails(event.result);
    const code = errorCode(event.result);
    const credentialMissing =
      event.isError && code === "AGENT_HOST_CREDENTIAL_MISSING";
    const declined = event.isError && code === "AGENT_DECLINED";
    setItems((current) =>
      current.map((item) => {
        if (item.kind !== "tool" || item.toolCallId !== event.toolCallId) {
          return item;
        }
        const status: ToolStatus = event.isError
          ? credentialMissing
            ? "credential-missing"
            : declined
              ? "declined"
              : "error"
          : "done";
        return {
          ...item,
          status,
          exitCode: details?.exitCode ?? null,
          durationMs: Date.now() - (item.startedAt ?? Date.now()),
          output: details?.stdout ?? errorMessage(event.result),
          errorMessage: event.isError ? errorMessage(event.result) : undefined,
        };
      }),
    );
    setHosts((current) =>
      current.map((host) => {
        const commands = host.commands.map((command) =>
          command.id === event.toolCallId
            ? {
                ...command,
                status: event.isError ? "error" as const : "ok" as const,
                awaitingConfirmation: false,
                error: event.isError
                  ? credentialMissing
                    ? "Connection refused — no saved credential."
                    : declined
                      ? "Declined by user."
                      : errorMessage(event.result)
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
    setItems((current) =>
      current.map((item) =>
        item.kind === "tool" &&
        item.status === "running" &&
        item.hostId === confirmation.hostId &&
        item.cmd === confirmation.command
          ? { ...item, verdict: { allow: false } }
          : item,
      ),
    );
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
  }, []);

  const applyEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "agentStart":
        setRunning(true);
        setError(undefined);
        return;
      case "messageStart":
        pushMessageItem(event.message);
        return;
      case "messageUpdate":
        patchAssistant(event.message, true);
        return;
      case "messageEnd":
        patchAssistant(event.message, false);
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
        setRunning(false);
        setAwaitingConfirm(false);
        setConfirmation(undefined);
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
          setItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.status === "running"
                ? { ...item, status: "aborted" as const }
                : item,
            ),
          );
          abortedRef.current = false;
        }
        setError(event.snapshot.errorMessage);
        return;
      case "historySaveFailed":
        setError("The agent session history could not be saved.");
        return;
      default:
        return;
    }
  }, [
    handleConfirmation,
    handleToolEnd,
    handleToolStart,
    patchAssistant,
    pushMessageItem,
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
    setItems((current) => [...current, {
      id: nextId("msg"),
      kind: "user",
      text: trimmed,
    }]);
    setRunning(true);
    const directives = parseDirectives(trimmed, resolveMentionLabel);
    const groupHosts = Object.fromEntries(
      groups.map((group) => [
        group.id,
        Object.values(hostsRef.current)
          .filter((host) => host.groupId === group.id)
          .map((host) => host.id),
      ]),
    );
    const targets = expandTargets(directives, groupHosts);
    try {
      const snapshot = await agentClient.prompt(
        activeAgentId,
        trimmed,
        targets,
        applyEvent,
      );
      applySnapshot(snapshot);
    } catch {
      setRunning(false);
      setError("The agent request failed.");
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

  const threadMessages = useMemo<ThreadMessageLike[]>(
    () => items.map(itemToThreadMessage),
    [items],
  );

  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    convertMessage: (message) => message,
    isRunning: running,
    isDisabled: !agentId,
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
    void agentClient
      .decideTool(agentId, current.confirmationId, decision === "run", command)
      .catch(() => setError("The confirmation is no longer valid."));
    if (decision === "run" && command && command !== current.command) {
      setItems((items) =>
        items.map((item) =>
          item.kind === "tool" &&
          item.hostId === current.hostId &&
          item.cmd === current.command
            ? { ...item, cmd: command }
            : item,
        ),
      );
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

  const newTask = useCallback(() => {
    const agentId = agentIdRef.current;
    if (agentId) void agentClient.abort(agentId).catch(() => undefined);
    abortedRef.current = false;
    setConfirmation(undefined);
    setItems([]);
    setHosts([]);
    setError(undefined);
    setDraft({ text: "", nonce: Date.now() });
    setRunning(false);
    setAwaitingConfirm(false);
    createAgent();
  }, [agentClient, createAgent]);

  const toggleExpand = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.kind === "tool" && item.id === id
          ? { ...item, expanded: !item.expanded }
          : item,
      ),
    );
  }, []);

  const credentialHostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.kind === "tool" && item.status === "credential-missing") {
        ids.add(item.hostId);
      }
    }
    return [...ids];
  }, [items]);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const providerLabel = selectedProvider
    ? `${selectedProvider.name} · ${selectedProvider.modelId}`
    : undefined;
  const statusLabel = awaitingConfirm
    ? "Approval"
    : running
      ? "Working"
      : "Ready";

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
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fog">
                    <ShieldCheck size={11} />
                    <span className="truncate">Multi-host ops · headless SSH</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={newTask}
                  aria-label="New task"
                  title="New task"
                  className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {items.length === 0 ? (
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
                <div
                  ref={streamRef}
                  className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-carbon/60 px-4 py-3"
                >
                  <div className="flex flex-col gap-3.5">
                    <ThreadPrimitive.Messages>
                      {({ message }) => (
                        <AgentMessageView
                          key={message.id}
                          message={message}
                          onToggleExpand={toggleExpand}
                        />
                      )}
                    </ThreadPrimitive.Messages>
                  </div>
                </div>
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
              busy={running}
              awaitingConfirm={awaitingConfirm}
              disabled={!agentId}
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
  onToggleExpand,
}: {
  message: MessageState;
  onToggleExpand: (id: string) => void;
}) {
  const buzz = message.metadata?.custom?.buzz as
    | { kind?: string; card?: ToolCardItem }
    | undefined;
  if (buzz?.kind === "tool" && buzz.card) {
    return <AgentCommandCard card={buzz.card} onToggleExpand={onToggleExpand} />;
  }
  if (message.role === "user") {
    const text = threadMessageText(message.content);
    return (
      <MessagePrimitive.Root className="rise-in flex gap-2.5">
        <AgentAvatar label="U" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-fog">You</div>
          <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            {text}
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }
  if (message.role === "assistant") {
    const text = threadMessageText(message.content);
    if (!text) return null;
    const streaming = message.status?.type === "running";
    return (
      <MessagePrimitive.Root className="rise-in flex gap-2.5">
        <AgentAvatar tone="ai" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium text-acid-lime/90">Agent</div>
          <div
            className={
              "mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist " +
              (streaming ? "stream-caret" : "")
            }
          >
            {text}
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }
  return null;
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

function AgentStatusBadge({ card }: { card: ToolCardItem }) {
  if (card.status === "pending") {
    return <span className="text-[11px] text-fog">queued</span>;
  }
  if (card.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-mist">
        <span className="spin h-3 w-3 rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
        running
      </span>
    );
  }
  if (card.status === "credential-missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        needs credential
      </span>
    );
  }
  if (card.status === "declined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">
        declined
      </span>
    );
  }
  if (card.status === "aborted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-graphite px-2 py-0.5 text-[11px] text-fog">
        aborted
      </span>
    );
  }
  const ok = card.status === "done" && card.exitCode === 0;
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
      {card.status === "done"
        ? `exit ${card.exitCode ?? "—"}`
        : "failed"}
    </span>
  );
}

function AgentCommandCard({
  card,
  onToggleExpand,
}: {
  card: ToolCardItem;
  onToggleExpand: (id: string) => void;
}) {
  const hasOutput = card.status === "done" || card.status === "error";
  const lines = card.output ? card.output.split("\n").filter(Boolean) : [];
  const excerpt = 5;
  const showExpand = lines.length > excerpt;
  const visible = card.expanded ? lines : lines.slice(0, excerpt);
  return (
    <div className="rise-in overflow-hidden rounded-xl border border-graphite bg-obsidian/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <VerdictChip allow={card.verdict.allow} />
        <AgentStatusBadge card={card} />
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-start gap-2 font-mono text-[12.5px] leading-relaxed text-mist">
          <span className="select-none text-fog">$</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {card.cmd}
          </span>
        </div>
      </div>

      {card.status === "running" ? (
        <div className="mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-fog">
          <span className="c-dim">capturing output…</span>
        </div>
      ) : hasOutput && lines.length > 0 ? (
        <div
          className={
            "mx-3 mb-2.5 rounded-md border border-graphite/70 bg-black/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed " +
            (card.status === "error" ? "text-coral-red/90" : "text-mist/90")
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
          {card.durationMs !== undefined && card.status === "done" ? (
            <span className="shrink-0">{formatDuration(card.durationMs)}</span>
          ) : null}
          <span className="inline-flex min-w-0 items-center gap-1">
            <Server size={11} className="shrink-0" />
            <span className="truncate">{card.hostLabel}</span>
          </span>
        </div>
        {showExpand ? (
          <button
            type="button"
            onClick={() => onToggleExpand(card.id)}
            className="inline-flex shrink-0 items-center gap-1 rounded text-fog transition-colors hover:text-mist"
          >
            <ChevronDown size={12} className={card.expanded ? "rotate-180" : ""} />
            {card.expanded
              ? "Show less"
              : `Expand (${lines.length - excerpt} more)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function threadMessageText(content: ThreadMessageLike["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function appendMessageText(message: AppendMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function itemToThreadMessage(item: AgentItem): ThreadMessageLike {
  if (item.kind === "user") {
    return { role: "user", id: item.id, content: item.text };
  }
  if (item.kind === "assistant") {
    return {
      role: "assistant",
      id: item.id,
      content: item.text ? [{ type: "text", text: item.text }] : [],
      status: item.streaming
        ? { type: "running" }
        : { type: "complete", reason: "stop" },
    };
  }
  return {
    role: "assistant",
    id: item.id,
    content: [],
    metadata: { custom: { buzz: { kind: "tool", card: item } } },
  };
}

function findLastIndex<T>(
  values: T[],
  predicate: (value: T) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index])) return index;
  }
  return -1;
}

function resultDetails(
  result: unknown,
): { stdout?: string; exitCode?: number | null } | undefined {
  if (!result || typeof result !== "object") return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") return undefined;
  const value = details as { stdout?: unknown; exitCode?: unknown };
  return {
    stdout: typeof value.stdout === "string" ? value.stdout : undefined,
    exitCode:
      typeof value.exitCode === "number" ? value.exitCode : null,
  };
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
