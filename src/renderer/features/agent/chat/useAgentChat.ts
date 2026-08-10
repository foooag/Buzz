import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import type { AgentClient, AgentEvent, AgentMessage, AgentSnapshot } from "@/features/agent/agentTypes";
import { createAgentChatTransport, type AgentChatTransportContext } from "./agentChatTransport";
import { mergeAuthoritative, wireMessageToUi } from "./agentMessageAdapter";
import {
  expandTargets,
  findReferencedHostIds,
  parseDirectives,
  type MentionResolver,
} from "@/features/agent/directiveText";

export type UseAgentChatOptions = {
  agentClient: AgentClient;
  providerConfigId: string | undefined;
  resolveMentionLabel?: MentionResolver;
  getGroupHostIds: () => Record<string, string[]>;
  getHosts: () => Array<{ id: string; name: string; address: string }>;
  onSideEvent: (event: AgentEvent) => void;
};

export type AgentChat = {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error: Error | undefined;
  sendMessage: (text: string) => void;
  stop: () => void;
  setMessages: (messages: UIMessage[]) => void;
  loadConversation: (assistantWire: AgentMessage[]) => void;
  reset: () => void;
};

export function useAgentChat(options: UseAgentChatOptions): AgentChat {
  const { agentClient, providerConfigId, resolveMentionLabel, getGroupHostIds, getHosts, onSideEvent } = options;

  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const agentIdRef = useRef<string | undefined>(undefined);
  agentIdRef.current = agentId;

  const onSideEventRef = useRef(onSideEvent);
  onSideEventRef.current = onSideEvent;

  const resolveTargets = useCallback((text: string) => {
    const directives = parseDirectives(text, resolveMentionLabel);
    const explicit = expandTargets(directives, getGroupHostIds());
    const referenced = findReferencedHostIds(text, getHosts());
    return [...new Set([...explicit, ...referenced])];
  }, [resolveMentionLabel, getGroupHostIds, getHosts]);

  const resolveTargetsRef = useRef(resolveTargets);
  resolveTargetsRef.current = resolveTargets;

  // Create/refresh the backend agent when the provider changes.
  useEffect(() => {
    if (!providerConfigId) return;
    let active = true;
    void agentClient.create({ providerConfigId }).then((snapshot) => {
      if (!active) {
        void agentClient.close(snapshot.agentId).catch(() => undefined);
        return;
      }
      agentIdRef.current = snapshot.agentId;
      setAgentId(snapshot.agentId);
    });
    return () => {
      active = false;
      const id = agentIdRef.current;
      if (id) void agentClient.close(id).catch(() => undefined);
      agentIdRef.current = undefined;
      setAgentId(undefined);
    };
  }, [agentClient, providerConfigId]);

  const onCompleteRef = useRef<(snapshot: AgentSnapshot) => void>(() => undefined);

  const ctxRef = useRef<Omit<AgentChatTransportContext, "agentClient">>({
    getAgentId: () => agentIdRef.current,
    resolveTargets: (text) => resolveTargetsRef.current(text),
    onSideEvent: (e) => onSideEventRef.current(e),
    onComplete: (snapshot) => onCompleteRef.current(snapshot),
  });

  const transport = useMemo(
    () => createAgentChatTransport({ agentClient, ...ctxRef.current }),
    [agentClient],
  );

  const chat = useChat({ transport });

  // Wire authoritative-snapshot completion THROUGH the ref. The transport
  // received a copy of ctxRef.current's functions at useMemo time, so mutating
  // ctxRef.current.onComplete directly would never reach it — the ref indirection
  // keeps the handler live for this chat instance.
  onCompleteRef.current = (snapshot) => {
    const assistantWire = snapshot.messages.filter((m) => m.role === "assistant");
    if (assistantWire.length === 0) return;
    chat.setMessages(mergeAuthoritative(chat.messages, assistantWire));
  };

  const loadConversation = useCallback((assistantWire: AgentMessage[]) => {
    chat.setMessages(assistantWire.map(wireMessageToUi));
  }, [chat]);

  const reset = useCallback(() => {
    chat.setMessages([]);
  }, [chat]);

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    sendMessage: (text) => chat.sendMessage({ text }),
    stop: () => chat.stop(),
    setMessages: chat.setMessages,
    loadConversation,
    reset,
  };
}
