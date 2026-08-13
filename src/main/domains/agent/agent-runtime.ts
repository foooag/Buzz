import { randomUUID } from "node:crypto";
import {
  Agent,
  type AgentEvent as PiAgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import {
  Type,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import { DomainError } from "../../ipc/domain-error.js";
import type { InventoryRepository } from "../inventory/repository.js";
import type { Host } from "../inventory/models.js";
import type { SshHeadlessRuntime } from "../ssh/headless.js";
import type { AiAgentMessage } from "../ai/agent-types.js";
import {
  createActiveContextCompactor,
  mergeAssistantStream,
} from "../ai/agent-runtime.js";
import type { AiHistoryRepository } from "../ai/history.js";
import type { AiModelRuntime } from "../ai/model-runtime.js";
import type { AiShellRiskRuntime, ShellAssessment } from "../ai/risk.js";
import {
  assertAllowedTargets,
  expandTargets,
  parseDirectives,
} from "./directives.js";
import { resolveHeadlessProfile } from "./host-resolution.js";
import type {
  AgentCreateInput,
  AgentEvent,
  AgentSnapshot,
} from "./agent-types.js";

const SYSTEM_PROMPT = [
  "You are the Buzz multi-host Linux operations agent.",
  "Use host_list to inspect approved targets and host_exec for every remote command.",
  "For every host_exec call, explain in plain language what the exact command will do and its expected impact.",
  "Never access a host outside the approved target list. Always provide an explicit cwd.",
].join(" ");
const CONFIRMATION_TTL_MS = 60_000;

type Emit = (event: AgentEvent) => void;

type PendingConfirmation = {
  id: string;
  settle(approved: boolean): void;
};

type AgentEntry = {
  id: string;
  ownerId: string;
  providerConfigId: string;
  vaultId?: string;
  allowedHosts: Set<string>;
  agent: Agent;
  unsubscribe: () => void;
  emit?: Emit;
  historyId?: string;
  historyTitle: string;
  pending?: PendingConfirmation;
  streamingAssistant?: AssistantMessage;
  closed: boolean;
};

export class MultiHostAgentRuntime {
  readonly #models: AiModelRuntime;
  readonly #history: AiHistoryRepository;
  readonly #risk: AiShellRiskRuntime;
  readonly #headless: SshHeadlessRuntime;
  readonly #inventory: InventoryRepository;
  readonly #entries = new Map<string, AgentEntry>();
  readonly #confirmationTtlMs: number;

  constructor(
    models: AiModelRuntime,
    history: AiHistoryRepository,
    risk: AiShellRiskRuntime,
    headless: SshHeadlessRuntime,
    inventory: InventoryRepository,
    confirmationTtlMs = CONFIRMATION_TTL_MS,
  ) {
    this.#models = models;
    this.#history = history;
    this.#risk = risk;
    this.#headless = headless;
    this.#inventory = inventory;
    this.#confirmationTtlMs = confirmationTtlMs;
  }

  create(ownerId: string, input: AgentCreateInput): AgentSnapshot {
    const model = this.#models.model(input.providerConfigId);
    const historySession = input.historySessionId
      ? this.#history.load(input.historySessionId)
      : undefined;
    if (historySession && historySession.sshSessionId !== "") {
      throw new DomainError(
        "AI_HISTORY_INVALID",
        "The selected history does not belong to the multi-host Agent.",
      );
    }
    const historyMessages = historySession?.messages;
    if (historyMessages !== undefined && !Array.isArray(historyMessages)) {
      throw new DomainError("AI_HISTORY_INVALID", "The selected Agent history is invalid.");
    }
    const id = randomUUID();
    const entry = {} as AgentEntry;
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: model.reasoning ? "medium" : "off",
        tools: [this.#createHostExecTool(id), this.#createHostListTool(id)],
        ...(historyMessages ? { messages: historyMessages as AgentMessage[] } : {}),
      },
      streamFn: (_model, context, options) =>
        this.#models.stream(input.providerConfigId, context, options),
      transformContext: createActiveContextCompactor(
        this.#models,
        input.providerConfigId,
        model,
      ),
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
      toolExecution: "sequential",
    });
    Object.assign(entry, {
      id,
      ownerId,
      providerConfigId: input.providerConfigId,
      vaultId: input.vaultId,
      allowedHosts: new Set(input.targets ?? []),
      agent,
      historyId: historySession?.id,
      historyTitle: historySession?.title ?? "Ops agent task",
      unsubscribe: () => undefined,
      closed: false,
    });
    entry.unsubscribe = agent.subscribe((event) => void this.#handleEvent(entry, event));
    this.#entries.set(id, entry);
    return snapshot(entry);
  }

  async prompt(
    ownerId: string,
    agentId: string,
    text: string,
    targets: string[],
    emit: Emit,
  ): Promise<AgentSnapshot> {
    const entry = this.#entry(ownerId, agentId);
    if (entry.agent.state.isStreaming || entry.emit) throw busy();
    const inventoryHosts = this.#hosts(entry);
    const inventoryIds = new Set(inventoryHosts.map((host) => host.id));
    const resolved = targets.length > 0
      ? targets
      : expandTargets(parseDirectives(text), this.#groupHosts(entry, inventoryHosts));
    assertAllowedTargets(resolved, inventoryIds);
    entry.allowedHosts = new Set(resolved);
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
    if (!entry.pending || entry.pending.id !== confirmationId) {
      throw confirmationUnavailable();
    }
    entry.pending.settle(approved);
  }

  async close(ownerId: string, agentId: string): Promise<void> {
    await this.#closeEntry(this.#entry(ownerId, agentId));
  }

  async closeOwner(ownerId: string): Promise<void> {
    await Promise.all([...this.#entries.values()]
      .filter((entry) => entry.ownerId === ownerId)
      .map((entry) => this.#closeEntry(entry)));
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#entries.values()].map((entry) => this.#closeEntry(entry)));
  }

  activeCount(): number {
    return this.#entries.size;
  }

  #createHostExecTool(agentId: string): AgentTool {
    return {
      name: "host_exec",
      label: "Run command on approved host",
      description: "Execute a non-interactive command on one approved inventory host.",
      parameters: Type.Object({
        hostId: Type.String({ minLength: 1 }),
        command: Type.String({ minLength: 1 }),
        explanation: Type.String({
          minLength: 1,
          description: "A concise, user-facing explanation of what the exact command does and its expected impact.",
        }),
        cwd: Type.Optional(Type.String({ minLength: 1 })),
        timeoutMs: Type.Optional(Type.Number({ minimum: 1_000, maximum: 300_000 })),
      }),
      executionMode: "sequential",
      execute: async (_toolCallId, raw, signal) => {
        const params = raw as {
          hostId: string;
          command: string;
          explanation: string;
          cwd?: string;
          timeoutMs?: number;
        };
        const entry = this.#entries.get(agentId);
        if (!entry || entry.closed) throw agentNotFound();
        const hostId = params.hostId.trim();
        assertAllowedTargets([hostId], entry.allowedHosts);
        const host = this.#findHost(entry, hostId);
        await this.#openHost(host);
        const cwd = params.cwd?.trim() || "$HOME";
        const command = params.command.trim();
        const explanation = params.explanation.trim();
        const assessment = this.#risk.assess(agentId, hostId, host.address, cwd, command);
        if (assessment.verdict.kind === "reject") {
          throw new Error(assessment.verdict.reason);
        }
        const token = assessment.verdict.kind === "needsConfirmation"
          ? await this.#confirm(agentId, assessment, command, explanation, signal)
          : undefined;
        if (signal?.aborted) throw new Error("The SSH command was cancelled.");
        this.#risk.authorize(agentId, hostId, host.address, cwd, command, token);
        const result = await this.#headless.exec(hostId, command, {
          cwd,
          timeoutMs: params.timeoutMs,
          signal,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    };
  }

  #createHostListTool(agentId: string): AgentTool {
    return {
      name: "host_list",
      label: "List approved hosts",
      description: "List the inventory hosts approved for this Agent task.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      execute: async () => {
        const entry = this.#entries.get(agentId);
        if (!entry || entry.closed) throw agentNotFound();
        const hosts = this.#hosts(entry)
          .filter((host) => entry.allowedHosts.has(host.id))
          .map((host) => ({ id: host.id, name: host.name, address: host.address }));
        return {
          content: [{ type: "text", text: JSON.stringify(hosts) }],
          details: hosts,
        };
      },
    };
  }

  async #handleEvent(entry: AgentEntry, event: PiAgentEvent): Promise<void> {
    if (entry.closed) return;
    switch (event.type) {
      case "agent_start":
        entry.streamingAssistant = undefined;
        entry.emit?.({ type: "agentStart" });
        return;
      case "message_start":
        if (event.message.role === "assistant") {
          entry.streamingAssistant = serializable(event.message);
        }
        entry.emit?.({ type: "messageStart", message: wireMessage(event.message) });
        return;
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
      case "message_end":
        if (event.message.role === "assistant" && entry.streamingAssistant) {
          const message = mergeAssistantStream(entry.streamingAssistant, event.message);
          event.message.content = message.content;
        }
        entry.streamingAssistant = undefined;
        entry.emit?.({ type: "messageEnd", message: wireMessage(event.message) });
        return;
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
      case "agent_end": {
        let historySaveFailed = false;
        try {
          const saved = this.#history.save({
            id: entry.historyId,
            title: entry.historyTitle,
            providerConfigId: entry.providerConfigId,
            sshSessionId: "",
            messages: serializable(entry.agent.state.messages),
          });
          entry.historyId = saved.id;
        } catch {
          historySaveFailed = true;
        }
        entry.emit?.({ type: "agentEnd", snapshot: { ...snapshot(entry), status: "idle" } });
        if (historySaveFailed) entry.emit?.({ type: "historySaveFailed" });
        return;
      }
      default:
        return;
    }
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
      entry.pending = { id: confirmationId, settle: finish };
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

  #hosts(entry: AgentEntry): Host[] {
    return entry.vaultId ? this.#inventory.listHosts(entry.vaultId) : [];
  }

  #groupHosts(
    entry: AgentEntry,
    hosts = this.#hosts(entry),
  ): Record<string, string[]> {
    const groups = entry.vaultId ? this.#inventory.listGroups(entry.vaultId) : [];
    return Object.fromEntries(groups.map((group) => [
      group.id,
      hosts.filter((host) => host.groupId === group.id).map((host) => host.id),
    ]));
  }

  #findHost(entry: AgentEntry, hostId: string): Host {
    const host = this.#hosts(entry).find((candidate) => candidate.id === hostId);
    if (!host) {
      throw new DomainError("AGENT_HOST_NOT_FOUND", "The Agent host was not found.");
    }
    return host;
  }

  async #openHost(host: Host): Promise<void> {
    if (this.#headless.hosts().includes(host.id)) return;
    try {
      await this.#headless.open(host.id, resolveHeadlessProfile(host));
    } catch (error) {
      if (error instanceof DomainError && [
        "SSH_CREDENTIAL_UNAVAILABLE",
        "SSH_PROFILE_INVALID",
      ].includes(error.code)) {
        throw new DomainError(
          "AGENT_HOST_CREDENTIAL_MISSING",
          "The Agent host needs a saved SSH credential.",
          { hostId: host.id },
        );
      }
      throw error;
    }
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

function snapshot(entry: AgentEntry): AgentSnapshot {
  return {
    agentId: entry.id,
    providerConfigId: entry.providerConfigId,
    status: entry.pending
      ? "waitingForConfirmation"
      : entry.agent.state.isStreaming
        ? "running"
        : "idle",
    hosts: [...entry.allowedHosts],
    messages: entry.agent.state.messages.map(wireMessage),
    ...(entry.agent.state.errorMessage
      ? { errorMessage: entry.agent.state.errorMessage.slice(0, 1_000) }
      : {}),
  };
}

function wireMessage(message: AgentMessage): AiAgentMessage {
  return serializable(message) as AiAgentMessage;
}

function serializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  return new DomainError(
    "AI_CONFIRMATION_UNAVAILABLE",
    "The AI confirmation is unavailable.",
  );
}
