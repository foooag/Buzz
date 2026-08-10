import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@/features/agent/agentTypes";
import {
  mergeAuthoritative,
  suffixDelta,
  uiMessageToWire,
  wireMessageToUi,
} from "@/features/agent/chat/agentMessageAdapter";

describe("suffixDelta", () => {
  it("returns the appended suffix", () => {
    expect(suffixDelta("Hello", "Hello world")).toBe(" world");
  });
  it("returns undefined when unchanged", () => {
    expect(suffixDelta("same", "same")).toBeUndefined();
  });
  it("falls back to the full string only when previous is empty", () => {
    expect(suffixDelta("", "fresh")).toBe("fresh");
  });
  it("returns undefined on a non-append change (defensive; backend is append-only)", () => {
    expect(suffixDelta("abc", "ab")).toBeUndefined();
  });
});

describe("wireMessageToUi / uiMessageToWire", () => {
  const wire: AgentMessage = {
    id: "m1",
    role: "assistant",
    content: [
      { type: "reasoning", text: "thinking" },
      { type: "text", text: "answer" },
      {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "host_exec",
        args: { hostId: "h1", command: "uptime" },
        argsText: '{"hostId":"h1","command":"uptime"}',
        result: { details: { exitCode: 0, stdout: "ok" } },
        isError: false,
        timing: { startedAt: 1, completedAt: 2 },
      },
    ],
    status: { type: "complete", reason: "stop" },
  };

  it("round-trips assistant text/reasoning/tool parts", () => {
    const ui = wireMessageToUi(wire);
    expect(ui.role).toBe("assistant");
    const types = ui.parts.map((p) => p.type);
    expect(types).toEqual(["reasoning", "text", "tool-host_exec"]);
    const tool = ui.parts[2] as any;
    expect(tool.toolCallId).toBe("c1");
    expect(tool.state).toBe("output-available");
    expect(tool.input).toEqual({ hostId: "h1", command: "uptime" });
    expect(tool.output).toEqual({
      result: { details: { exitCode: 0, stdout: "ok" } },
      isError: false,
      timing: { startedAt: 1, completedAt: 2 },
    });
    expect(uiMessageToWire(ui)).toEqual(wire);
  });

  it("marks a tool-call with no result as input-available", () => {
    const pending: AgentMessage = {
      id: "m2", role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c2", toolName: "host_exec", args: { hostId: "h1", command: "x" }, argsText: "{}" }],
      status: { type: "running" },
    };
    const tool = wireMessageToUi(pending).parts[0] as any;
    expect(tool.state).toBe("input-available");
    expect(tool.output).toBeUndefined();
  });
});

describe("mergeAuthoritative", () => {
  it("replaces assistant messages by id and preserves user messages", () => {
    const user = wireMessageToUi({ id: "u1", role: "user", content: [{ type: "text", text: "hi" }] });
    const asst = wireMessageToUi({ id: "a1", role: "assistant", content: [{ type: "text", text: "draft" }], status: { type: "running" } });
    const authoritative: AgentMessage = { id: "a1", role: "assistant", content: [{ type: "text", text: "final" }], status: { type: "complete", reason: "stop" } };
    const merged = mergeAuthoritative([user, asst], [authoritative]);
    expect(merged.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect((merged[1]!.parts[0] as any).text).toBe("final");
  });
});
