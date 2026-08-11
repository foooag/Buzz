import type { AgentEvent, AgentToolConfirmation } from "./agentTypes";

export type HostCommandProgress = {
  toolCallId: string;
  command: string;
  status: "running" | "success" | "error";
  output?: string;
};

export type HostProgress = {
  hostId: string;
  phase: "idle" | "running" | "success" | "error" | "awaitingConfirmation";
  commands: HostCommandProgress[];
};

export function initialHostProgress(hostIds: readonly string[]): HostProgress[] {
  return hostIds.map((hostId) => ({ hostId, phase: "idle", commands: [] }));
}

export function reduceHostProgress(
  current: readonly HostProgress[],
  event: AgentEvent,
): HostProgress[] {
  if (event.type === "toolStart" && event.toolName === "host_exec") {
    const args = objectValue(event.args);
    const hostId = stringValue(args?.hostId);
    if (!hostId) return [...current];
    const command = stringValue(args?.command) ?? "Remote command";
    return updateHost(current, hostId, (host) => ({
      ...host,
      phase: "running",
      commands: [...host.commands, {
        toolCallId: event.toolCallId,
        command,
        status: "running",
      }],
    }));
  }
  if (event.type === "toolEnd" && event.toolName === "host_exec") {
    return current.map((host) => {
      if (!host.commands.some((command) => command.toolCallId === event.toolCallId)) {
        return host;
      }
      const commands = host.commands.map((command) => command.toolCallId === event.toolCallId
        ? {
            ...command,
            status: event.isError ? "error" as const : "success" as const,
            output: formatToolOutput(event.result),
          }
        : command);
      return {
        ...host,
        commands,
        phase: event.isError ? "error" : "success",
      };
    });
  }
  if (event.type === "toolConfirmationRequired") {
    const index = [...current].reverse().findIndex((host) => host.phase === "running");
    if (index < 0) return [...current];
    const actual = current.length - index - 1;
    return current.map((host, hostIndex) => hostIndex === actual
      ? { ...host, phase: "awaitingConfirmation" }
      : host);
  }
  return [...current];
}

export function reduceConfirmation(
  current: AgentToolConfirmation | null,
  event: AgentEvent,
): AgentToolConfirmation | null {
  if (event.type === "toolConfirmationRequired") return event.confirmation;
  if (event.type === "toolEnd" || event.type === "agentEnd") return null;
  return current;
}

export function deriveCredentialHostIds(events: readonly AgentEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== "toolEnd" || !event.isError) continue;
    const serialized = JSON.stringify(event.result);
    if (!serialized.includes("AGENT_HOST_CREDENTIAL_MISSING")) continue;
    const hostId = stringValue(objectValue(event.result)?.hostId);
    if (hostId) ids.add(hostId);
  }
  return [...ids];
}

function updateHost(
  current: readonly HostProgress[],
  hostId: string,
  update: (host: HostProgress) => HostProgress,
): HostProgress[] {
  let found = false;
  const next = current.map((host) => {
    if (host.hostId !== hostId) return host;
    found = true;
    return update(host);
  });
  return found
    ? next
    : [...next, update({ hostId, phase: "idle", commands: [] })];
}

function formatToolOutput(result: unknown): string {
  const value = objectValue(result);
  if (value) {
    const stdout = stringValue(value.stdout);
    const stderr = stringValue(value.stderr);
    if (stdout || stderr) return [stdout, stderr].filter(Boolean).join("\n");
  }
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
