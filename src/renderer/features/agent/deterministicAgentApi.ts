import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type {
  AgentClient,
  AgentCreateInput,
  AgentEvent,
  AgentMessage,
  AgentSnapshot,
  AgentToolConfirmation,
} from "./agentTypes";

type DeterministicState = {
  cancelled: boolean;
  confirm: {
    confirmationId: string;
    resolve: (decision: { approved: boolean; command?: string }) => void;
  } | null;
  timers: Set<ReturnType<typeof setTimeout>>;
};

type TimelineSegment =
  | { kind: "assistant"; text: string }
  | {
      kind: "exec";
      hostId: string;
      hostLabel: string;
      command: string;
      output?: string[];
      risky?: { reason: string; projectedEffect: string };
      credentialMissing?: boolean;
    };

const agents = new Map<string, DeterministicState>();
let agentSeq = 0;
let messageSeq = 0;

export function createDeterministicAgentApi(): AgentClient {
  return {
    async create(input: AgentCreateInput) {
      const agentId = `agent-${++agentSeq}`;
      agents.set(agentId, {
        cancelled: false,
        confirm: null,
        timers: new Set(),
      });
      return {
        agentId,
        providerConfigId: input.providerConfigId,
        status: "idle",
        hosts: input.targets ?? [],
        messages: [],
      };
    },
    async prompt(agentId, text, targets, onEvent) {
      const state = agents.get(agentId);
      if (!state) throw new Error("The agent task is no longer available.");
      state.cancelled = false;
      const providerConfigId = "";
      onEvent({ type: "agentStart" });
      const timeline = buildTimeline(text, targets);
      for (const segment of timeline) {
        if (state.cancelled) break;
        if (segment.kind === "assistant") {
          await streamAssistant(state, onEvent, segment.text);
        } else {
          await runExec(state, onEvent, segment);
        }
      }
      const snapshot: AgentSnapshot = {
        agentId,
        providerConfigId,
        status: "idle",
        hosts: targets,
        messages: [],
      };
      onEvent({ type: "agentEnd", snapshot });
      return snapshot;
    },
    async steer() {
      return undefined;
    },
    async abort(agentId) {
      const state = agents.get(agentId);
      if (!state) return;
      state.cancelled = true;
      clearTimers(state);
      state.confirm?.resolve({ approved: false });
      state.confirm = null;
    },
    async decideTool(agentId, confirmationId, approved, command) {
      const state = agents.get(agentId);
      if (!state?.confirm || state.confirm.confirmationId !== confirmationId) {
        throw new Error("The confirmation is no longer valid.");
      }
      state.confirm.resolve({ approved, command });
      state.confirm = null;
    },
    async close(agentId) {
      const state = agents.get(agentId);
      if (!state) return;
      state.cancelled = true;
      clearTimers(state);
      agents.delete(agentId);
    },
  };
}

async function streamAssistant(
  state: DeterministicState,
  onEvent: (event: AgentEvent) => void,
  text: string,
): Promise<void> {
  const id = `message-${++messageSeq}`;
  const base: Extract<AgentMessage, { role: "assistant" }> = {
    id,
    role: "assistant",
    content: [],
    status: { type: "running" },
  };
  onEvent({ type: "messageStart", message: base });
  const words = text.split(" ");
  let acc = "";
  for (let index = 0; index < words.length; index += 1) {
    if (state.cancelled) break;
    acc += (index ? " " : "") + words[index];
    onEvent({
      type: "messageUpdate",
      message: {
        ...base,
        content: [{ type: "text", text: acc }],
      },
    });
    await sleep(state, index % 3 === 0 ? 18 : 12);
  }
  onEvent({
    type: "messageEnd",
    message: {
      ...base,
      content: [{ type: "text", text: acc }],
      status: state.cancelled
        ? { type: "incomplete", reason: "cancelled" }
        : { type: "complete", reason: "stop" },
    },
  });
}

async function runExec(
  state: DeterministicState,
  onEvent: (event: AgentEvent) => void,
  segment: Extract<TimelineSegment, { kind: "exec" }>,
): Promise<void> {
  const toolCallId = `call-${segment.hostId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const args = {
    hostId: segment.hostId,
    command: segment.command,
    cwd: "$HOME",
  };
  const toolMessage: Extract<AgentMessage, { role: "assistant" }> = {
    id: `message-${++messageSeq}`,
    role: "assistant",
    content: [{
      type: "tool-call",
      toolCallId,
      toolName: "host_exec",
      args,
      argsText: JSON.stringify(args),
    }],
    status: { type: "requires-action", reason: "tool-calls" },
  };
  onEvent({ type: "messageStart", message: toolMessage });
  onEvent({ type: "messageEnd", message: toolMessage });
  onEvent({
    type: "toolStart",
    toolCallId,
    toolName: "host_exec",
    args,
  });
  await sleep(state, 360);
  if (state.cancelled) return;

  if (segment.credentialMissing) {
    onEvent({
      type: "toolEnd",
      toolCallId,
      toolName: "host_exec",
      result: {
        error: {
          code: "AGENT_HOST_CREDENTIAL_MISSING",
          message: "No saved credential for this host.",
        },
      },
      isError: true,
    });
    return;
  }

  if (segment.risky) {
    const confirmation: AgentToolConfirmation = {
      confirmationId: `confirm-${Date.now()}`,
      level: "high",
      reason: segment.risky.reason,
      projectedEffect: segment.risky.projectedEffect,
      hostId: segment.hostId,
      command: segment.command,
    };
    const decision = await new Promise<{ approved: boolean; command?: string }>(
      (resolve) => {
        state.confirm = { confirmationId: confirmation.confirmationId, resolve };
        onEvent({ type: "toolConfirmationRequired", confirmation });
      },
    );
    if (state.cancelled || !decision.approved) {
      onEvent({
        type: "toolEnd",
        toolCallId,
        toolName: "host_exec",
        result: { error: { code: "AGENT_DECLINED", message: "Declined by user." } },
        isError: true,
      });
      return;
    }
    await sleep(state, 700);
  }

  if (state.cancelled) return;
  onEvent({
    type: "toolUpdate",
    toolCallId,
    toolName: "host_exec",
    partialResult: { stdout: segment.output?.join("\n") ?? "" },
  });
  await sleep(state, 300);
  if (state.cancelled) return;
  onEvent({
    type: "toolEnd",
    toolCallId,
    toolName: "host_exec",
    result: {
      details: {
        stdout: (segment.output ?? []).join("\n"),
        stderr: "",
        exitCode: 0,
        truncated: false,
      },
    },
    isError: false,
  });
}

function buildTimeline(text: string, targets: string[]): TimelineSegment[] {
  const label = (index: number) => {
    const hostId = targets[index] ?? `host-${index + 1}`;
    return (
      useInventoryStore.getState().hosts[hostId]?.name ??
      hostId
    );
  };
  if (text.includes("健康检查") || text.includes("Production")) {
    const hosts = targets.slice(0, 4);
    const timeline: TimelineSegment[] = [
      {
        kind: "assistant",
        text: `Running a quick health check across the group — ${hosts.length || 1} hosts. I'll ask before anything destructive.`,
      },
    ];
    hosts.forEach((hostId, index) => {
      if (index === 2) {
        timeline.push({
          kind: "exec",
          hostId,
          hostLabel: label(index),
          command: "uptime && df -h / | tail -n 1",
          output: ["Connection refused — no saved credential. Skipping."],
          credentialMissing: true,
        });
      } else if (index === 3) {
        timeline.push({
          kind: "exec",
          hostId,
          hostLabel: label(index),
          command: "tail -n 20 /var/log/bastion/conn.log",
          output: [
            " 08:58:11 bridge 203.0.113.42 → db-primary  ok",
            " 08:58:12 bridge 203.0.113.43 → web-prod-01  ok",
          ],
          risky: {
            reason:
              "Reads a log file that may contain connection metadata from other teams.",
            projectedEffect:
              "Shows the last 20 lines of the log on the target host. No changes are made.",
          },
        });
      } else {
        timeline.push({
          kind: "exec",
          hostId,
          hostLabel: label(index),
          command: "uptime && df -h / | tail -n 1",
          output: [
            " 09:42:0X up 14 days, load average: 0.18, 0.22, 0.19",
            "/dev/vda1   39G   18G   19G  49%  /",
          ],
        });
      }
    });
    timeline.push({
      kind: "assistant",
      text: "Summary — checked each host, skipped hosts without saved credentials, and only read sensitive files after approval.",
    });
    return timeline;
  }

  return [
    {
      kind: "assistant",
      text: "On it. I'll read the container definition on the first host, then replicate the same container on the second.",
    },
    {
      kind: "exec",
      hostId: targets[0] ?? "host-1",
      hostLabel: label(0),
      command: "docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Status}}'",
      output: [
        "CONTAINER ID   IMAGE             COMMAND                  CREATED      STATUS",
        "e6f2a1c9b0d4   shop/app:1.4.2    \"/entrypoint.sh serve\"   3 days ago   Up 3 days (healthy)",
      ],
    },
    {
      kind: "exec",
      hostId: targets[0] ?? "host-1",
      hostLabel: label(0),
      command: "docker inspect e6f2a1c9b0d4 --format '{{json .Config}}'",
      output: [
        "{",
        '  "Image": "shop/app:1.4.2",',
        '  "Env": ["NODE_ENV=production","SHOP_ENV=prod"],',
        '  "ExposedPorts": {"8080/tcp": {}}',
        "}",
      ],
    },
    {
      kind: "assistant",
      text: "Got it — image shop/app:1.4.2, port 8080, NODE_ENV=production. Now on the second host: pull the image, then run the identical container.",
    },
    {
      kind: "exec",
      hostId: targets[1] ?? "host-2",
      hostLabel: label(1),
      command: "docker pull shop/app:1.4.2",
      output: [
        "1.4.2: Pulling from shop/app",
        "Digest: sha256:9f2a…d31e",
        "Status: Downloaded newer image for shop/app:1.4.2",
      ],
    },
    {
      kind: "exec",
      hostId: targets[1] ?? "host-2",
      hostLabel: label(1),
      command:
        "docker run -d --name shop -p 8080:8080 -e NODE_ENV=production shop/app:1.4.2",
      output: ["e6f2a1c9b0d4…"],
      risky: {
        reason:
          "Runs a new container on a production host — starts the shop service on port 8080.",
        projectedEffect:
          "Starts shop (shop/app:1.4.2) on the second host at 0.0.0.0:8080. The service begins serving traffic immediately.",
      },
    },
    {
      kind: "exec",
      hostId: targets[1] ?? "host-2",
      hostLabel: label(1),
      command: "docker ps --filter name=shop --format '{{.Names}}  {{.Status}}'",
      output: ["shop  Up Less than a second (healthy)"],
    },
    {
      kind: "assistant",
      text: "Done. The shop container is now running on both hosts with identical configuration.",
    },
  ];
}

function sleep(
  state: DeterministicState,
  ms: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (state.cancelled) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      state.timers.delete(timer);
      resolve();
    }, ms);
    state.timers.add(timer);
  });
}

function clearTimers(state: DeterministicState): void {
  state.timers.forEach((timer) => clearTimeout(timer));
  state.timers.clear();
}
