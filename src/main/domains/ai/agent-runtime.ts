import { randomUUID } from "node:crypto";
import {
  Agent,
  CompactionError,
  DEFAULT_COMPACTION_SETTINGS,
  estimateContextTokens,
  estimateTokens,
  serializeConversation,
  shouldCompact,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type CompactionSettings,
} from "@earendil-works/pi-agent-core";
import {
  Type,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Message,
  type Model,
} from "@earendil-works/pi-ai";
import { DomainError } from "../../ipc/domain-error.js";
import type { SshRuntime } from "../ssh/runtime.js";
import type { AiHistoryRepository } from "./history.js";
import type { AiModelRuntime } from "./model-runtime.js";
import type { AiShellRiskRuntime, ShellAssessment } from "./risk.js";
import type {
  AiAgentEvent,
  AiAgentMessage,
  AiAgentSnapshot,
} from "./agent-types.js";

const SYSTEM_PROMPT =
  "You are the Buzz Linux SSH assistant. Use only registered tools, always pass an explicit remote CWD, and provide a plain-language explanation of every ssh_exec command and its expected impact.";
const CONFIRMATION_TTL_MS = 60_000;

type Emit = (event: AiAgentEvent) => void;

type PendingConfirmation = {
  id: string;
  token: string;
  settle(approved: boolean): void;
};

type AgentEntry = {
  id: string;
  ownerId: string;
  providerConfigId: string;
  sshSessionId: string;
  agent: Agent;
  unsubscribe: () => void;
  emit?: Emit;
  sessionId?: string;
  pending?: PendingConfirmation;
  streamingAssistant?: AssistantMessage;
  closed: boolean;
};

export class AiAgentRuntime {
  readonly #models: AiModelRuntime;
  readonly #history: AiHistoryRepository;
  readonly #risk: AiShellRiskRuntime;
  readonly #ssh: SshRuntime;
  readonly #entries = new Map<string, AgentEntry>();
  readonly #confirmationTtlMs: number;

  constructor(
    models: AiModelRuntime,
    history: AiHistoryRepository,
    risk: AiShellRiskRuntime,
    ssh: SshRuntime,
    confirmationTtlMs = CONFIRMATION_TTL_MS,
  ) {
    this.#models = models;
    this.#history = history;
    this.#risk = risk;
    this.#ssh = ssh;
    this.#confirmationTtlMs = confirmationTtlMs;
  }

  create(ownerId: string, providerConfigId: string, sshSessionId: string): AiAgentSnapshot {
    const model = this.#models.model(providerConfigId);
    this.#ssh.host(sshSessionId);
    const id = randomUUID();
    const tool = this.#createSshTool(id, sshSessionId);
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: model.reasoning ? "medium" : "off",
        tools: [tool],
      },
      streamFn: (_model, context, options) =>
        this.#models.stream(providerConfigId, context, options),
      transformContext: createActiveContextCompactor(
        this.#models,
        providerConfigId,
        model,
      ),
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
      toolExecution: "sequential",
    });
    const entry: AgentEntry = {
      id,
      ownerId,
      providerConfigId,
      sshSessionId,
      agent,
      unsubscribe: () => undefined,
      closed: false,
    };
    entry.unsubscribe = agent.subscribe((event) => this.#handleEvent(entry, event));
    this.#entries.set(id, entry);
    return snapshot(entry);
  }

  async prompt(
    ownerId: string,
    agentId: string,
    text: string,
    emit: Emit,
  ): Promise<AiAgentSnapshot> {
    const entry = this.#entry(ownerId, agentId);
    if (entry.agent.state.isStreaming || entry.emit) throw busy();
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
    entry.pending?.settle(false);
    entry.agent.abort();
  }

  decideTool(
    ownerId: string,
    agentId: string,
    confirmationId: string,
    approved: boolean,
  ): void {
    const entry = this.#entry(ownerId, agentId);
    if (!entry.pending || entry.pending.id !== confirmationId) throw confirmationUnavailable();
    entry.pending.settle(approved);
  }

  async close(ownerId: string, agentId: string): Promise<void> {
    const entry = this.#entry(ownerId, agentId);
    await this.#closeEntry(entry);
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
  }

  activeCount(): number {
    return this.#entries.size;
  }

  /** Live session context for quick-script generation (PRD F2: runtime first). */
  sessionContext(sshSessionId: string): { messages: readonly AgentMessage[]; sessionId: string | undefined } | undefined {
    for (const entry of this.#entries.values()) {
      if (entry.sshSessionId === sshSessionId && !entry.closed) {
        return { messages: entry.agent.state.messages, sessionId: entry.sessionId };
      }
    }
    return undefined;
  }

  async #handleEvent(entry: AgentEntry, event: AgentEvent): Promise<void> {
    if (entry.closed) return;
    switch (event.type) {
      case "agent_start":
        entry.streamingAssistant = undefined;
        entry.emit?.({ type: "agentStart" });
        return;
      case "message_start": {
        if (event.message.role === "assistant") {
          entry.streamingAssistant = serializable(event.message);
        }
        entry.emit?.({ type: "messageStart", message: wireMessage(event.message) });
        return;
      }
      case "message_update": {
        if (event.message.role !== "assistant") return;
        const message = mergeAssistantStream(
          entry.streamingAssistant,
          event.message,
          event.assistantMessageEvent,
        );
        entry.streamingAssistant = message;
        entry.emit?.({ type: "messageUpdate", message: wireMessage(message) });
        return;
      }
      case "message_end": {
        if (event.message.role === "assistant" && entry.streamingAssistant) {
          const message = mergeAssistantStream(entry.streamingAssistant, event.message);
          // Agent has already stored this final message before subscribers run.
          // Updating the shared final object keeps later turns, snapshots, and
          // encrypted history aligned with the complete streamed transcript.
          event.message.content = message.content;
        }
        entry.streamingAssistant = undefined;
        entry.emit?.({ type: "messageEnd", message: wireMessage(event.message) });
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
            title: "SSH AI session",
            providerConfigId: entry.providerConfigId,
            sshSessionId: entry.sshSessionId,
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

  #createSshTool(agentId: string, sshSessionId: string): AgentTool {
    const parameters = Type.Object({
      command: Type.String({ minLength: 1 }),
      explanation: Type.String({
        minLength: 1,
        description: "A concise, user-facing explanation of what the exact command does and its expected impact.",
      }),
      cwd: Type.Optional(Type.String({ minLength: 1 })),
      timeoutMs: Type.Optional(Type.Number({ minimum: 1_000, maximum: 300_000 })),
    });
    return {
      name: "ssh_exec",
      label: "Run in active SSH terminal",
      description:
        "Execute a non-interactive command in the active Linux SSH terminal. The command and output are visible in that terminal. Always pass cwd; it defaults to the remote HOME.",
      parameters,
      executionMode: "sequential",
      execute: async (_toolCallId, raw, signal) => {
        const params = raw as {
          command: string;
          explanation: string;
          cwd?: string;
          timeoutMs?: number;
        };
        const cwd = params.cwd?.trim() || "$HOME";
        const command = params.command.trim();
        const explanation = params.explanation.trim();
        const host = this.#ssh.host(sshSessionId);
        const assessment = this.#risk.assess(agentId, sshSessionId, host, cwd, command);
        let token: string | undefined;
        if (assessment.verdict.kind === "reject") throw new Error(assessment.verdict.reason);
        if (assessment.verdict.kind === "needsConfirmation") {
          token = await this.#confirm(agentId, assessment, command, explanation, signal);
        }
        if (signal?.aborted) throw new Error("The SSH command was cancelled.");
        this.#risk.authorize(agentId, sshSessionId, host, cwd, command, token);
        const result = await this.#ssh.executeCommand(
          sshSessionId,
          cwd,
          command,
          params.timeoutMs ?? 30_000,
          signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    };
  }

  #confirm(
    agentId: string,
    assessment: ShellAssessment,
    command: string,
    explanation: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const entry = this.#entries.get(agentId);
    if (!entry || entry.closed || assessment.verdict.kind !== "needsConfirmation" ||
      !assessment.confirmationToken || entry.pending) {
      throw confirmationUnavailable();
    }
    const verdict = assessment.verdict;
    const token = assessment.confirmationToken;
    const confirmationId = randomUUID();
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (approved: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (entry.pending?.id === confirmationId) entry.pending = undefined;
        if (approved) resolve(token);
        else {
          this.#risk.discard(token);
          reject(new Error("The SSH command was not confirmed."));
        }
      };
      const abort = () => finish(false);
      const timeout = setTimeout(() => finish(false), this.#confirmationTtlMs);
      timeout.unref();
      entry.pending = { id: confirmationId, token, settle: finish };
      entry.emit?.({
        type: "toolConfirmationRequired",
        confirmation: {
          confirmationId,
          level: verdict.level,
          command,
          reason: verdict.reason,
          projectedEffect: explanation || verdict.projectedEffect || verdict.reason,
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
    entry.pending?.settle(false);
    entry.agent.abort();
    await entry.agent.waitForIdle();
    entry.unsubscribe();
    entry.emit = undefined;
    entry.streamingAssistant = undefined;
  }

  #entry(ownerId: string, agentId: string): AgentEntry {
    const entry = this.#entries.get(agentId);
    if (!entry || entry.closed || entry.ownerId !== ownerId) throw agentNotFound();
    return entry;
  }
}

type SummaryGenerator = (
  messages: AgentMessage[],
  models: AiModelRuntime,
  providerConfigId: string,
  model: Model<string>,
  reserveTokens: number,
  signal?: AbortSignal,
  previousSummary?: string,
) => Promise<{ ok: true; value: string } | { ok: false; error: CompactionError }>;

export function createActiveContextCompactor(
  models: AiModelRuntime,
  providerConfigId: string,
  model: Model<string>,
  settings: CompactionSettings = DEFAULT_COMPACTION_SETTINGS,
  summarize: SummaryGenerator = generateSummary,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  let summary: string | undefined;
  let summarizedCount = 0;
  return async (messages, signal) => {
    const current = activeMessages(messages, summary, summarizedCount);
    if (!settings.enabled ||
      !shouldCompact(estimateContextTokens(current).tokens, model.contextWindow, settings)) {
      return current;
    }
    const retainedStart = findRetainedTurnStart(messages, settings.keepRecentTokens);
    if (retainedStart <= summarizedCount) return current;
    const result = await summarize(
      messages.slice(summarizedCount, retainedStart),
      models,
      providerConfigId,
      model,
      settings.reserveTokens,
      signal,
      summary,
    );
    if (!result.ok) return current;
    summary = result.value;
    summarizedCount = retainedStart;
    return activeMessages(messages, summary, summarizedCount);
  };
}

async function generateSummary(
  messages: AgentMessage[],
  models: AiModelRuntime,
  providerConfigId: string,
  _model: Model<string>,
  reserveTokens: number,
  signal?: AbortSignal,
  previousSummary?: string,
): ReturnType<SummaryGenerator> {
  const response = await models.complete(providerConfigId, {
    systemPrompt:
      "Summarize the supplied conversation for continuation. Preserve commands, outcomes, decisions, paths, errors, and unfinished work. Do not continue the task.",
    messages: [{
      role: "user",
      content: [serializeConversation(messages.filter(isLlmMessage)), previousSummary
        ? `Previous summary:\n${previousSummary}`
        : ""].filter(Boolean).join("\n\n"),
      timestamp: Date.now(),
    }],
  }, { maxTokens: reserveTokens, signal });
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    return { ok: false, error: new CompactionError(
      response.stopReason === "aborted" ? "aborted" : "summarization_failed",
      response.errorMessage ?? "The active context could not be summarized.",
    ) };
  }
  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text
    ? { ok: true, value: text }
    : { ok: false, error: new CompactionError(
      "summarization_failed",
      "The active context summary was empty.",
    ) };
}

function isLlmMessage(message: AgentMessage): message is Message {
  return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}

function activeMessages(
  messages: AgentMessage[],
  summary: string | undefined,
  summarizedCount: number,
): AgentMessage[] {
  if (!summary || summarizedCount === 0) return messages;
  return [{
    role: "user",
    content: `<context_summary>\n${summary}\n</context_summary>`,
    timestamp: Date.now(),
  }, ...messages.slice(summarizedCount)];
}

function findRetainedTurnStart(messages: AgentMessage[], keepRecentTokens: number): number {
  let retainedTokens = 0;
  let candidate = messages.length;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    retainedTokens += estimateTokens(messages[index]);
    if (retainedTokens > keepRecentTokens) {
      candidate = index + 1;
      break;
    }
    candidate = index;
  }
  while (candidate < messages.length && messages[candidate].role !== "user") candidate += 1;
  return candidate;
}

function snapshot(entry: AgentEntry): AiAgentSnapshot {
  return {
    agentId: entry.id,
    providerConfigId: entry.providerConfigId,
    sshSessionId: entry.sshSessionId,
    status: entry.pending
      ? "waitingForConfirmation"
      : entry.agent.state.isStreaming
        ? "running"
        : "idle",
    messages: wireMessages(entry.agent.state.messages),
    ...(entry.agent.state.errorMessage
      ? { errorMessage: entry.agent.state.errorMessage.slice(0, 1_000) }
      : {}),
  };
}

function wireMessages(messages: AgentMessage[]): AiAgentMessage[] {
  return messages.map(wireMessage);
}

function wireMessage(message: AgentMessage): AiAgentMessage {
  switch (message.role) {
    case "user":
      return {
        role: "user",
        content: serializable(message.content),
        timestamp: message.timestamp,
      };
    case "assistant":
      return {
        role: "assistant",
        content: serializable(message.content),
        stopReason: message.stopReason,
        timestamp: message.timestamp,
        ...(message.errorMessage
          ? { errorMessage: message.errorMessage.slice(0, 1_000) }
          : {}),
      };
    case "toolResult":
      return {
        role: "toolResult",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        content: serializable(message.content),
        isError: message.isError,
        timestamp: message.timestamp,
      };
    default:
      return {
        role: "user",
        content: "[Unsupported agent message]",
        timestamp: Date.now(),
      };
  }
}

function serializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function mergeAssistantStream(
  previous: AssistantMessage | undefined,
  incoming: AssistantMessage,
  update?: AssistantMessageEvent,
): AssistantMessage {
  const message = serializable(incoming);
  if (!previous) return message;

  const previousContent = previous.content;
  const incomingContent = message.content;
  const content = Array.from(
    { length: Math.max(previousContent.length, incomingContent.length) },
    (_, index) => mergeContentBlock(previousContent[index], incomingContent[index]),
  ).filter((part): part is AssistantMessage["content"][number] => Boolean(part));
  message.content = content;

  if (!update) return message;

  if (
    update.type === "text_start" ||
    update.type === "text_end" ||
    update.type === "text_delta"
  ) {
    const previousPart = previousContent[update.contentIndex];
    const incomingPart = incomingContent[update.contentIndex];
    const previousText = previousPart?.type === "text" ? previousPart.text : "";
    content[update.contentIndex] = {
      type: "text",
      text: update.type === "text_start"
        ? ""
        : update.type === "text_end"
          ? update.content
          : `${previousText}${update.delta}`,
      ...(previousPart?.type === "text" && previousPart.textSignature
        ? { textSignature: previousPart.textSignature }
        : incomingPart?.type === "text" && incomingPart.textSignature
          ? { textSignature: incomingPart.textSignature }
          : {}),
    };
  } else if (
    update.type === "thinking_start" ||
    update.type === "thinking_end" ||
    update.type === "thinking_delta"
  ) {
    const previousPart = previousContent[update.contentIndex];
    const incomingPart = incomingContent[update.contentIndex];
    const previousThinking = previousPart?.type === "thinking" ? previousPart.thinking : "";
    content[update.contentIndex] = {
      type: "thinking",
      thinking: update.type === "thinking_start"
        ? ""
        : update.type === "thinking_end"
          ? update.content
          : `${previousThinking}${update.delta}`,
      ...(previousPart?.type === "thinking" && previousPart.thinkingSignature
        ? { thinkingSignature: previousPart.thinkingSignature }
        : incomingPart?.type === "thinking" && incomingPart.thinkingSignature
          ? { thinkingSignature: incomingPart.thinkingSignature }
          : {}),
    };
  }
  return message;
}

function mergeContentBlock(
  previous: AssistantMessage["content"][number] | undefined,
  incoming: AssistantMessage["content"][number] | undefined,
): AssistantMessage["content"][number] | undefined {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (previous.type !== incoming.type) return incoming;
  if (previous.type === "text" && incoming.type === "text") {
    return {
      ...incoming,
      text: richerPrefix(previous.text, incoming.text),
    };
  }
  if (previous.type === "thinking" && incoming.type === "thinking") {
    return {
      ...previous,
      ...incoming,
      thinking: richerPrefix(previous.thinking, incoming.thinking),
    };
  }
  return incoming;
}

function richerPrefix(previous: string, incoming: string): string {
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  return incoming;
}

function agentNotFound(): DomainError {
  return new DomainError("AI_AGENT_NOT_FOUND", "The AI agent is unavailable.");
}

function busy(): DomainError {
  return new DomainError("AI_AGENT_BUSY", "The AI agent is already running.");
}

function notRunning(): DomainError {
  return new DomainError("AI_AGENT_NOT_RUNNING", "The AI agent is not running.");
}

function confirmationUnavailable(): DomainError {
  return new DomainError("AI_CONFIRMATION_UNAVAILABLE", "The AI confirmation is unavailable.");
}
