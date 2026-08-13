import type { AgentClient, AgentEvent, AgentSnapshot } from "./agentTypes";

export function createDeterministicAgentApi(): AgentClient {
  const agents = new Map<string, AgentSnapshot>();
  return {
    async create(input) {
      const snapshot: AgentSnapshot = {
        agentId: crypto.randomUUID(),
        providerConfigId: input.providerConfigId,
        status: "idle",
        hosts: input.targets ?? [],
        messages: [],
      };
      agents.set(snapshot.agentId, snapshot);
      return snapshot;
    },
    streamPrompt(agentId, text, targets, onEvent, _vaultId, onClose) {
      let stopped = false;
      const snapshot = agents.get(agentId);
      const hostId = targets[0] ?? "host-1";
      const timers = [
        window.setTimeout(() => emit({ type: "agentStart" }), 10),
        window.setTimeout(() => emit({
          type: "messageStart",
          message: assistantMessage([]),
        }), 25),
        window.setTimeout(() => emit({
          type: "messageUpdate",
          message: assistantMessage([
            { type: "thinking", thinking: "Inspecting the deterministic host before running uptime." },
          ]),
        }), 40),
        window.setTimeout(() => emit({
          type: "messageEnd",
          message: assistantMessage([
            { type: "thinking", thinking: "Inspecting the deterministic host before running uptime." },
          ], "toolUse"),
        }), 55),
        window.setTimeout(() => emit({
          type: "toolStart",
          toolCallId: "deterministic-host-exec",
          toolName: "host_exec",
          args: { hostId, command: "uptime" },
        }), 70),
        window.setTimeout(() => emit({
          type: "toolEnd",
          toolCallId: "deterministic-host-exec",
          toolName: "host_exec",
          result: { hostId, stdout: "up 1 day" },
          isError: false,
        }), 400),
        window.setTimeout(() => emit({
          type: "messageStart",
          message: assistantMessage([]),
        }), 415),
        window.setTimeout(() => emit({
          type: "messageUpdate",
          message: assistantMessage([
            {
              type: "text",
              text: `Checked ${targets.length || "the selected"} host target. The deterministic Agent is ready.\n\nResponse details:`,
            },
          ]),
        }), 430),
        window.setTimeout(() => emit({
          type: "messageEnd",
          message: assistantMessage([
            {
              type: "text",
              text: `Checked ${targets.length || "the selected"} host target. The deterministic Agent is ready.\n\nResponse details:\n\n- Docker response content is complete.\n- Final line remains visible.`,
            },
          ]),
        }), 445),
        window.setTimeout(() => {
          if (!snapshot) return;
          const completed = { ...snapshot, status: "idle" as const, hosts: targets };
          agents.set(agentId, completed);
          emit({ type: "agentEnd", snapshot: completed as never });
          onClose?.();
        }, 460),
      ];
      function emit(event: AgentEvent) {
        if (!stopped) onEvent(event);
      }
      return () => {
        if (stopped) return;
        stopped = true;
        timers.forEach((timer) => window.clearTimeout(timer));
        onClose?.();
      };
    },
    async steer() {},
    async abort() {},
    async decideTool() {},
    async close(agentId) {
      agents.delete(agentId);
    },
  };
}

function assistantMessage(
  content: Array<
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
  >,
  stopReason: "stop" | "toolUse" = "stop",
) {
  return {
    role: "assistant" as const,
    content,
    stopReason,
    timestamp: Date.now(),
  };
}
