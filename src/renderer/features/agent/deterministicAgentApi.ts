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
          message: assistantMessage(""),
        }), 25),
        window.setTimeout(() => emit({
          type: "toolStart",
          toolCallId: "deterministic-host-exec",
          toolName: "host_exec",
          args: { hostId, command: "uptime" },
        }), 40),
        window.setTimeout(() => emit({
          type: "messageUpdate",
          message: assistantMessage(`Checked ${targets.length || "the selected"} host target. `),
        }), 60),
        window.setTimeout(() => emit({
          type: "toolEnd",
          toolCallId: "deterministic-host-exec",
          toolName: "host_exec",
          result: { hostId, stdout: "up 1 day" },
          isError: false,
        }), 75),
        window.setTimeout(() => emit({
          type: "messageEnd",
          message: assistantMessage(`Checked ${targets.length || "the selected"} host target. The deterministic Agent is ready.`),
        }), 90),
        window.setTimeout(() => {
          if (!snapshot) return;
          const completed = { ...snapshot, status: "idle" as const, hosts: targets };
          agents.set(agentId, completed);
          emit({ type: "agentEnd", snapshot: completed as never });
          onClose?.();
        }, 110),
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

function assistantMessage(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text", text }],
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}
