import { randomUUID } from "node:crypto";
import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type AssistantMessage, type ToolResultMessage } from "@earendil-works/pi-ai";
import { DomainError } from "../../ipc/domain-error.js";
import type { AiHistoryRepository } from "../ai/history.js";
import type { AiModelRuntime } from "../ai/model-runtime.js";
import type { AiShellRiskRuntime, ShellAssessment } from "../ai/risk.js";
import type { SshHeadlessRuntime } from "../ssh/headless.js";
import {
  assertNoUnknownTargets,
  expandTargets,
  parseDirectives,
} from "./directives.js";
import type { AgentHostResolver } from "./host-resolution.js";
import type {
  AgentEventWire,
  AgentMessageWire,
  AgentMessageStatusWire,
  AgentSnapshotWire,
} from "./agent-types.js";

const SYSTEM_PROMPT =
  "You are the Buzz multi-host ops agent. You may only operate on the hosts explicitly mentioned in the user's request. Targets use assistant-ui directives: :host[label]{name=id} for a host and :group[label]{name=id} for a group. Pass the directive's name value (the internal id), not its label, to tools. Use host_exec to run commands on one target host and host_list to enumerate hosts in a group. Always pass cwd. Explain risky actions before requesting confirmation.";
const CONFIRMATION_TTL_MS = 60_000;
const HISTORY_SSH_SESSION_ID = "headless";

export type AgentCreateInput = {
  providerConfigId: string;
  targets?: string[];
};

type Emit = (event: AgentEventWire) => void;

type ConfirmationDecision = {
  approved: boolean;
  command?: string;
};

type PendingConfirmation = {
  id: string;
  settle(decision: ConfirmationDecision): void;
};

type AgentEntry = {
  id: string;
  ownerId: string;
  providerConfigId: string;
  hosts: string[];
  allowedHosts: Set<string>;
  agent: Agent;
  unsubscribe: () => void;
  emit?: Emit;
  sessionId?: string;
  pending?: PendingConfirmation;
  streamingAssistantId?: string;
  messageIds: WeakMap<object, string>;
  closed: boolean;
};

export class MultiHostAgentRuntime {
  readonly #models: AiModelRuntime;
  readonly #history: AiHistoryRepository;
  readonly #risk: AiShellRiskRuntime;
  readonly #headless: SshHeadlessRuntime;
  readonly #resolver?: AgentHostResolver;
  readonly #entries = new Map<string, AgentEntry>();
  readonly #confirmationTtlMs: number;

  constructor(
    models: AiModelRuntime,
    history: AiHistoryRepository,
    risk: AiShellRiskRuntime,
    headless: SshHeadlessRuntime,
    resolver?: AgentHostResolver,
    confirmationTtlMs = CONFIRMATION_TTL_MS,
  ) {
    this.#models = models;
    this.#history = history;
    this.#risk = risk;
    this.#headless = headless;
    this.#resolver = resolver;
    this.#confirmationTtlMs = confirmationTtlMs;
  }

  create(ownerId: string, input: AgentCreateInput): { agentId: string; snapshot: AgentSnapshotWire } {
    const model = this.#models.model(input.providerConfigId);
    const id = randomUUID();
    const targets = input.targets ?? [];
    const allowedHosts = new Set(targets);
    // The tools capture the live entry, so it is created before the Agent.
    const entry: AgentEntry = {
      id,
      ownerId,
      providerConfigId: input.providerConfigId,
      hosts: [...targets],
      allowedHosts,
      agent: undefined as unknown as Agent,
      unsubscribe: () => undefined,
      messageIds: new WeakMap(),
      closed: false,
    };
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: model.reasoning ? "medium" : "off",
        tools: this.#tools(entry),
      },
      streamFn: (_model, context, options) =>
        this.#models.stream(input.providerConfigId, context, options),
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
      toolExecution: "sequential",
    });
    entry.agent = agent;
    entry.unsubscribe = agent.subscribe((event) => void this.#handleEvent(entry, event));
    this.#entries.set(id, entry);
    return { agentId: id, snapshot: snapshot(entry) };
  }

  async prompt(
    ownerId: string,
    agentId: string,
    text: string,
    opts: { targets?: string[] } = {},
    emit: Emit,
  ): Promise<AgentSnapshotWire> {
    const entry = this.#entry(ownerId, agentId);
    if (entry.agent.state.isStreaming || entry.emit) throw busy();
    const explicitTargets = expandTargets(
      (opts.targets ?? []).map((target) => ({ type: "host", id: target, label: target })),
      {},
    );
    const allowed = new Set(explicitTargets);
    const resolver = this.#resolver;
    for (const directive of parseDirectives(
      text,
      resolver ? (label) => resolver.resolveMentionLabel(label) : undefined,
    )) {
      if (directive.type === "host") {
        assertNoUnknownTargets([directive.id], allowed);
      } else {
        assertNoUnknownTargets(this.#groupHosts()[directive.id] ?? [], allowed);
      }
    }
    entry.allowedHosts = allowed;
    entry.hosts = [...allowed];
    entry.emit = emit;
    try {
      await entry.agent.prompt(text);
      return snapshot(entry);
    } finally {
      if (entry.emit === emit) entry.emit = undefined;
    }
  }

  steer(ownerId: string, agentId: string, text: string): void {
    const entry = this.#entry(ownerId, agentId);
    if (!entry.agent.state.isStreaming) throw notRunning();
    entry.agent.steer({ role: "user", content: text, timestamp: Date.now() });
  }

  abort(ownerId: string, agentId: string): void {
    const entry = this.#entry(ownerId, agentId);
    entry.pending?.settle({ approved: false });
    entry.agent.abort();
  }

  decideTool(
    ownerId: string,
    agentId: string,
    confirmationId: string,
    approved: boolean,
    command?: string,
  ): void {
    const entry = this.#entry(ownerId, agentId);
    if (!entry.pending || entry.pending.id !== confirmationId) throw confirmationUnavailable();
    entry.pending.settle({
      approved,
      ...(command?.trim() ? { command: command.trim() } : {}),
    });
  }

  async close(ownerId: string, agentId: string): Promise<void> {
    await this.#closeEntry(this.#entry(ownerId, agentId));
  }

  async closeOwner(ownerId: string): Promise<void> {
    await Promise.all(
      [...this.#entries.values()]
        .filter((entry) => entry.ownerId === ownerId)
        .map((entry) => this.#closeEntry(entry)),
    );
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#entries.values()].map((entry) => this.#closeEntry(entry)));
    await this.#headless.closeAll();
  }

  activeCount(): number {
    return this.#entries.size;
  }

  #tools(entry: AgentEntry): AgentTool[] {
    const headless = this.#headless;
    const risk = this.#risk;
    return [
      {
        name: "host_exec",
        label: "Run command on a target host",
        description:
          "Execute a non-interactive command on one target host. hostId must be a target of this task. Always pass cwd; it defaults to the remote HOME.",
        parameters: Type.Object({
          hostId: Type.String({ minLength: 1 }),
          command: Type.String({ minLength: 1 }),
          cwd: Type.Optional(Type.String({ minLength: 1 })),
          timeoutMs: Type.Optional(Type.Number({ minimum: 1_000, maximum: 300_000 })),
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, raw, signal) => {
          const params = raw as {
            hostId: string;
            command: string;
            cwd?: string;
            timeoutMs?: number;
          };
          const hostId = params.hostId.trim();
          const command = params.command.trim();
          const cwd = params.cwd?.trim() || "$HOME";
          assertNoUnknownTargets([hostId], entry.allowedHosts);
          const assessment = risk.assess(entry.id, hostId, hostId, cwd, command);
          if (assessment.verdict.kind === "reject") throw new Error(assessment.verdict.reason);
          let commandToRun = command;
          let token: string | undefined;
          if (assessment.verdict.kind === "needsConfirmation") {
            const decision = await this.#confirm(
              entry,
              assessment,
              signal,
              { hostId, command },
            );
            if (!decision.approved) throw new Error("The SSH command was not confirmed.");
            const edited = decision.command?.trim();
            if (edited && edited !== command) {
              commandToRun = edited;
              if (assessment.confirmationToken) this.#risk.discard(assessment.confirmationToken);
              const editedAssessment = risk.assess(entry.id, hostId, hostId, cwd, commandToRun);
              if (editedAssessment.verdict.kind === "reject") {
                throw new Error(editedAssessment.verdict.reason);
              }
              if (editedAssessment.verdict.kind === "needsConfirmation" &&
                editedAssessment.confirmationToken) {
                this.#risk.discard(editedAssessment.confirmationToken);
              }
            } else {
              token = assessment.confirmationToken;
            }
          }
          if (signal?.aborted) throw new Error("The SSH command was cancelled.");
          if (token) {
            this.#risk.authorize(entry.id, hostId, hostId, cwd, commandToRun, token);
          }
          await this.#openHost(hostId);
          const result = await headless.exec(hostId, commandToRun, {
            cwd,
            timeoutMs: params.timeoutMs,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
          };
        },
      },
      {
        name: "host_list",
        label: "List hosts in a group",
        description: "Return the host ids in a target group.",
        parameters: Type.Object({
          groupId: Type.String({ minLength: 1 }),
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, raw) => {
          const params = raw as { groupId: string };
          const hosts = (this.#groupHosts()[params.groupId] ?? [])
            .filter((hostId) => entry.allowedHosts.has(hostId));
          return {
            content: [{ type: "text", text: JSON.stringify(hosts) }],
            details: hosts,
          };
        },
      },
    ];
  }

  async #openHost(hostId: string): Promise<void> {
    if (this.#headless.has(hostId)) return;
    if (this.#resolver) {
      const profile = await this.#resolver.resolveProfile(hostId);
      await this.#headless.open(hostId, profile);
      return;
    }
    await this.#headless.open(hostId);
  }

  #groupHosts(): Record<string, string[]> {
    return this.#resolver?.groupHosts() ?? {};
  }

  async #handleEvent(entry: AgentEntry, event: AgentEvent): Promise<void> {
    if (entry.closed) return;
    switch (event.type) {
      case "agent_start":
        entry.streamingAssistantId = undefined;
        entry.emit?.({ type: "agentStart" });
        return;
      case "message_start": {
        const id = messageId(entry, event.message);
        if (event.message.role === "assistant") {
          entry.streamingAssistantId = id;
          entry.emit?.({
            type: "messageStart",
            message: wireAssistantMessage(event.message, id),
          });
        }
        return;
      }
      case "message_update": {
        if (event.message.role !== "assistant") return;
        const id = entry.streamingAssistantId ?? messageId(entry, event.message);
        entry.emit?.({
          type: "messageUpdate",
          message: wireAssistantMessage(event.message, id),
        });
        return;
      }
      case "message_end": {
        if (event.message.role === "assistant") {
          const id = entry.streamingAssistantId ?? messageId(entry, event.message);
          entry.messageIds.set(event.message, id);
          entry.emit?.({
            type: "messageEnd",
            message: wireAssistantMessage(event.message, id),
          });
        }
        entry.streamingAssistantId = undefined;
        return;
      }
      case "tool_execution_start":
        entry.emit?.({
          type: "toolStart",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: serializable(event.args),
        });
        return;
      case "tool_execution_update":
        entry.emit?.({
          type: "toolUpdate",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          partialResult: serializable(event.partialResult),
        });
        return;
      case "tool_execution_end":
        entry.emit?.({
          type: "toolEnd",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: serializable(event.result),
          isError: event.isError,
        });
        return;
      case "agent_end":
        let historySaveFailed = false;
        try {
          const saved = this.#history.save({
            id: entry.sessionId,
            title: "Ops agent task",
            providerConfigId: entry.providerConfigId,
            sshSessionId: HISTORY_SSH_SESSION_ID,
            messages: serializable(event.messages),
          });
          entry.sessionId = saved.id;
        } catch {
          historySaveFailed = true;
        }
        entry.emit?.({
          type: "agentEnd",
          snapshot: { ...snapshot(entry), status: "idle" },
        });
        if (historySaveFailed) entry.emit?.({ type: "historySaveFailed" });
        return;
      default:
        return;
    }
  }

  #confirm(
    entry: AgentEntry,
    assessment: ShellAssessment,
    signal?: AbortSignal,
    context?: { hostId: string; command: string },
  ): Promise<ConfirmationDecision> {
    if (entry.closed || assessment.verdict.kind !== "needsConfirmation" ||
      entry.pending) {
      throw confirmationUnavailable();
    }
    const verdict = assessment.verdict;
    const confirmationId = randomUUID();
    return new Promise<ConfirmationDecision>((resolve, reject) => {
      let settled = false;
      const finish = (decision: ConfirmationDecision) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (entry.pending?.id === confirmationId) entry.pending = undefined;
        if (!decision.approved) {
          if (assessment.confirmationToken) this.#risk.discard(assessment.confirmationToken);
        }
        resolve(decision);
      };
      const abort = () => finish({ approved: false });
      const timeout = setTimeout(() => finish({ approved: false }), this.#confirmationTtlMs);
      timeout.unref();
      entry.pending = { id: confirmationId, settle: finish };
      entry.emit?.({
        type: "toolConfirmationRequired",
        confirmation: {
          confirmationId,
          level: verdict.level,
          reason: verdict.reason,
          projectedEffect: verdict.projectedEffect,
          hostId: context?.hostId,
          command: context?.command,
        },
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  }

  async #closeEntry(entry: AgentEntry): Promise<void> {
    if (entry.closed) return;
    entry.closed = true;
    this.#entries.delete(entry.id);
    entry.pending?.settle({ approved: false });
    entry.agent.abort();
    await entry.agent.waitForIdle();
    entry.unsubscribe();
    entry.emit = undefined;
    entry.streamingAssistantId = undefined;
  }

  #entry(ownerId: string, agentId: string): AgentEntry {
    const entry = this.#entries.get(agentId);
    if (!entry || entry.closed || entry.ownerId !== ownerId) throw agentNotFound();
    return entry;
  }
}

function snapshot(entry: AgentEntry): AgentSnapshotWire {
  return {
    agentId: entry.id,
    providerConfigId: entry.providerConfigId,
    status: entry.pending
      ? "waitingForConfirmation"
      : entry.agent.state.isStreaming
        ? "running"
        : "idle",
    hosts: entry.hosts,
    messages: wireMessages(entry, entry.agent.state.messages),
    ...(entry.agent.state.errorMessage
      ? { errorMessage: entry.agent.state.errorMessage.slice(0, 1_000) }
      : {}),
  };
}

function wireMessages(entry: AgentEntry, messages: AgentMessage[]): AgentMessageWire[] {
  const output: AgentMessageWire[] = [];
  const toolParts = new Map<string, { messageIndex: number; partIndex: number }>();
  for (const message of messages) {
    if (message.role === "user") {
      output.push(wireUserMessage(messageId(entry, message), message.content));
      continue;
    }
    if (message.role === "assistant") {
      const wire = wireAssistantMessage(message, messageId(entry, message));
      const messageIndex = output.push(wire) - 1;
      wire.content.forEach((part, partIndex) => {
        if (part.type === "tool-call") {
          toolParts.set(part.toolCallId, { messageIndex, partIndex });
        }
      });
      continue;
    }
    if (message.role === "toolResult") {
      mergeToolResult(output, toolParts, message);
    }
  }
  return output;
}

function messageId(entry: AgentEntry, message: object): string {
  const existing = entry.messageIds.get(message);
  if (existing) return existing;
  const id = randomUUID();
  entry.messageIds.set(message, id);
  return id;
}

function wireUserMessage(
  id: string,
  content: Extract<AgentMessage, { role: "user" }>["content"],
): AgentMessageWire {
  const parts = typeof content === "string" ? [{ type: "text" as const, text: content }] :
    content.flatMap((part) => part.type === "text"
      ? [{ type: "text" as const, text: part.text }]
      : []);
  return { id, role: "user", content: parts };
}

function wireAssistantMessage(message: AssistantMessage, id: string): AgentMessageWire {
  const partStatus = message.stopReason === "pending"
    ? { type: "running" as const }
    : { type: "complete" as const };
  return {
    id,
    role: "assistant",
    content: message.content.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text, status: partStatus };
      }
      if (part.type === "thinking") {
        return { type: "reasoning", text: part.thinking, status: partStatus };
      }
      return {
        type: "tool-call",
        toolCallId: part.id,
        toolName: part.name,
        args: serializable(part.arguments) as Record<string, unknown>,
        argsText: JSON.stringify(part.arguments),
      };
    }),
    status: assistantStatus(message),
  };
}

function assistantStatus(message: AssistantMessage): AgentMessageStatusWire {
  switch (message.stopReason) {
    case "pending":
      return { type: "running" as const };
    case "stop":
      return { type: "complete" as const, reason: "stop" as const };
    case "toolUse":
      return { type: "requires-action" as const, reason: "tool-calls" as const };
    case "length":
      return { type: "incomplete" as const, reason: "length" as const };
    case "aborted":
      return { type: "incomplete" as const, reason: "cancelled" as const };
    case "error":
      return {
        type: "incomplete" as const,
        reason: "error" as const,
        ...(message.errorMessage
          ? { error: message.errorMessage.slice(0, 1_000) }
          : {}),
      };
  }
}

function mergeToolResult(
  messages: AgentMessageWire[],
  toolParts: Map<string, { messageIndex: number; partIndex: number }>,
  result: ToolResultMessage,
): void {
  const location = toolParts.get(result.toolCallId);
  if (!location) return;
  const message = messages[location.messageIndex];
  if (message?.role !== "assistant") return;
  const part = message.content[location.partIndex];
  if (part?.type !== "tool-call") return;
  message.content[location.partIndex] = {
    ...part,
    result: result.details ?? result.content,
    isError: result.isError,
    timing: {
      startedAt: part.timing?.startedAt ?? result.timestamp,
      completedAt: result.timestamp,
    },
  };
}

function serializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function busy(): DomainError {
  return new DomainError(
    "AI_AGENT_BUSY",
    "The agent is already working on a request.",
  );
}

function notRunning(): DomainError {
  return new DomainError(
    "AI_AGENT_NOT_RUNNING",
    "The agent is not running a request.",
  );
}

function agentNotFound(): DomainError {
  return new DomainError(
    "AI_AGENT_NOT_FOUND",
    "The agent task is no longer available.",
  );
}

function confirmationUnavailable(): DomainError {
  return new DomainError(
    "AI_CONFIRMATION_UNAVAILABLE",
    "The confirmation is no longer valid.",
  );
}
