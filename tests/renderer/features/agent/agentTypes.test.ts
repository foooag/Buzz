import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentToolCallPart } from "@/features/agent/agentTypes";

describe("AgentMessage wire types (local, assistant-ui-free)", () => {
  it("accepts an assistant tool-call message matching the backend wire shape", () => {
    const message: AgentMessage = {
      id: "m1",
      role: "assistant",
      content: [{
        type: "tool-call",
        toolCallId: "c1",
        toolName: "host_exec",
        args: { hostId: "h1", command: "uptime" },
        argsText: "{}",
        result: { details: { exitCode: 0 } },
        isError: false,
        timing: { startedAt: 1, completedAt: 2 },
      } satisfies AgentToolCallPart],
      status: { type: "complete", reason: "stop" },
    };
    expect(message.content[0]!.type).toBe("tool-call");
  });

  it("accepts a user text message", () => {
    const message: AgentMessage = {
      id: "u1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
    };
    expect(message.role).toBe("user");
  });
});
