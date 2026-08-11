import {
  AssistantRuntimeProvider,
  type ThreadAssistantMessagePart,
  ThreadPrimitive,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { Bot, Loader2, Plus, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { aiConfigApi } from "@/features/ai/aiApi";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";
import type { AiAgentMessage } from "@/features/ai/aiAgentTypes";
import {
  aiSessionApi,
  type AiSessionClient,
  type AiSessionSummary,
} from "@/features/ai/aiSessionApi";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import { agentApi } from "./agentApi";
import type { AgentClient, AgentEvent, AgentToolConfirmation } from "./agentTypes";
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
  const [createError, setCreateError] = useState<string | null>(null);
  const [progress, setProgress] = useState<HostProgress[]>([]);
  const [confirmation, setConfirmation] = useState<AgentToolConfirmation | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sessions, setSessions] = useState<AiSessionSummary[]>([]);
  const [historyMessages, setHistoryMessages] = useState<AiAgentMessage[] | null>(null);
  const [agentRevision, setAgentRevision] = useState(0);

  const groupHosts = useMemo(() => Object.fromEntries(
    Object.values(groups)
      .filter((group) => !activeVaultId || group.vaultId === activeVaultId)
      .map((group) => [
        group.id,
        Object.values(hosts)
          .filter((host) => host.groupId === group.id)
          .map((host) => host.id),
      ]),
  ), [activeVaultId, groups, hosts]);
  const agentIdRef = useRef<string | null>(null);
  const groupHostsRef = useRef<Readonly<Record<string, readonly string[]>>>(groupHosts);
  const vaultIdRef = useRef<string | null>(activeVaultId);
  agentIdRef.current = agentId;
  groupHostsRef.current = groupHosts;
  vaultIdRef.current = activeVaultId;

  const refreshSessions = useCallback(() => sessionApi.list().then((items) => {
    setSessions(items.filter((item) => item.sshSessionId === ""));
  }), [sessionApi]);

  useEffect(() => {
    let cancelled = false;
    void providerApi.list().then((items) => {
      if (cancelled) return;
      setProviders(items);
      setProviderId((current) => current || items.find((item) => item.isDefault)?.id || items[0]?.id || "");
    }).catch(() => {
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
    void agentClient.create({
      providerConfigId: providerId,
      ...(activeVaultId ? { vaultId: activeVaultId } : {}),
      targets: [],
    }).then((snapshot) => {
      createdAgentId = snapshot.agentId;
      if (closed) {
        void agentClient.close(snapshot.agentId).catch(() => undefined);
        return;
      }
      setAgentId(snapshot.agentId);
      setProgress(initialHostProgress(snapshot.hosts));
    }).catch(() => {
      if (!closed) setCreateError("The operations Agent could not be started.");
    });
    return () => {
      closed = true;
      if (createdAgentId) void agentClient.close(createdAgentId).catch(() => undefined);
    };
  }, [activeVaultId, agentClient, agentRevision, providerId]);

  const sideDispatch = useCallback((event: AgentEvent) => {
    setProgress((current) => reduceHostProgress(current, event));
    setConfirmation((current) => reduceConfirmation(current, event));
    setEvents((current) => [...current.slice(-99), event]);
    if (event.type === "agentEnd") void refreshSessions().catch(() => undefined);
  }, [refreshSessions]);
  const credentialHostIds = useMemo(() => deriveCredentialHostIds(events), [events]);

  const decide = (approved: boolean) => {
    if (!agentId || !confirmation) return;
    const confirmationId = confirmation.confirmationId;
    setConfirmation(null);
    void agentClient.decideTool(agentId, confirmationId, approved).catch(() => undefined);
  };

  if (providers === null) {
    return <CenteredState icon={<Loader2 className="spin size-5" />} text="Loading Agent…" />;
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
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-void">
      <header className="flex items-center gap-3 border-b border-graphite bg-carbon px-5 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-acid-lime/10 text-acid-lime">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h1 className="m-0 text-[14px] font-semibold text-paper">Agent</h1>
          <p className="m-0 text-[10.5px] text-fog">Multi-host operations through verified SSH</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <HistoryDropdown
            sessions={sessions}
            onLoad={(id) => {
              void sessionApi.load(id).then((record) => setHistoryMessages(record.messages));
            }}
            onDelete={(id) => {
              void sessionApi.delete(id).then(() => {
                setSessions((current) => current.filter((session) => session.id !== id));
              });
            }}
            onRename={(id, title) => {
              void sessionApi.rename(id, title).then((renamed) => {
                setSessions((current) => current.map((session) =>
                  session.id === id ? renamed : session));
              });
            }}
          />
          <select
            aria-label="AI provider"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            className="max-w-52 rounded-md border border-graphite bg-obsidian px-2.5 py-1.5 text-[11px] text-mist outline-hidden"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
          <button
            type="button"
            title="New task"
            aria-label="New Agent task"
            onClick={() => {
              setHistoryMessages([]);
              setEvents([]);
              setProgress([]);
              setConfirmation(null);
              setAgentRevision((current) => current + 1);
            }}
            className="grid size-8 place-items-center rounded-md border border-graphite text-fog hover:bg-graphite hover:text-paper"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 min-w-0 p-4">
          <HostErrorBanner hostIds={credentialHostIds} onConnect={onOpenServers} />
          {createError ? (
            <p role="alert" className="text-[12px] text-coral-red">{createError}</p>
          ) : agentId ? (
            <AgentConversation
              agentClient={agentClient}
              agentIdRef={agentIdRef}
              groupHostsRef={groupHostsRef}
              vaultIdRef={vaultIdRef}
              sideDispatch={sideDispatch}
              historyMessages={historyMessages}
            />
          ) : (
            <div className="grid h-full place-items-center text-[12px] text-fog">
              <span className="flex items-center gap-2"><Loader2 className="spin size-4" /> Starting Agent…</span>
            </div>
          )}
        </section>
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
          <ProgressPanel hosts={progress} />
          {confirmation ? (
            <div className="border-l border-t border-graphite bg-carbon p-3">
              <ConfirmCard confirmation={confirmation} onDecide={decide} />
            </div>
          ) : null}
        </div>
      </div>
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
}: {
  agentClient: AgentClient;
  agentIdRef: RefObject<string | null>;
  groupHostsRef: RefObject<Readonly<Record<string, readonly string[]>>>;
  vaultIdRef: RefObject<string | null>;
  sideDispatch: (event: AgentEvent) => void;
  historyMessages: AiAgentMessage[] | null;
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
      <ThreadPrimitive.Root className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
        <ThreadPrimitive.Viewport className="scroll-thin min-h-0 space-y-4 overflow-y-auto pr-2" autoScroll>
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 pb-8 pt-2">
            <AgentMessages />
          </div>
        </ThreadPrimitive.Viewport>
        <div className="mx-auto w-full max-w-3xl pt-3">
          <MentionComposer autoFocus />
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function toThreadMessages(messages: readonly AiAgentMessage[]): ThreadMessageLike[] {
  return messages.flatMap((message): ThreadMessageLike[] => {
    if (message.role === "user") {
      const text = typeof message.content === "string"
        ? message.content
        : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      return [{ role: "user", content: [{ type: "text", text }] }];
    }
    if (message.role === "assistant") {
      return [{
        role: "assistant",
        content: message.content.flatMap((part): ThreadAssistantMessagePart[] => {
          if (part.type === "text") return [{ type: "text" as const, text: part.text }];
          if (part.type === "thinking") return [{ type: "reasoning" as const, text: part.thinking }];
          if (part.type === "toolCall") return [{
            type: "tool-call" as const,
            toolCallId: part.id,
            toolName: part.name,
            args: (part.arguments ?? {}) as never,
            argsText: JSON.stringify(part.arguments ?? {}),
          }];
          return [];
        }),
      }];
    }
    return [];
  });
}

function CenteredState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="grid h-full place-items-center bg-void p-8 text-center text-fog">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl border border-graphite bg-carbon text-acid-lime">{icon}</span>
        <p className="m-0 text-[13px] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
