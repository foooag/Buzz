import { describe, expect, it } from "vitest";
import {
  initialHostProgress,
  reduceHostProgress,
} from "../../../../src/renderer/features/agent/agentItems";

describe("Agent host progress", () => {
  it("aggregates tool start/end by host", () => {
    const started = reduceHostProgress(initialHostProgress(["h1"]), {
      type: "toolStart",
      toolCallId: "t1",
      toolName: "host_exec",
      args: { hostId: "h1", command: "uptime" },
    });
    const ended = reduceHostProgress(started, {
      type: "toolEnd",
      toolCallId: "t1",
      toolName: "host_exec",
      result: { stdout: "up", stderr: "", exitCode: 0 },
      isError: false,
    });

    expect(ended).toEqual([expect.objectContaining({
      hostId: "h1",
      phase: "success",
      commands: [expect.objectContaining({ command: "uptime", output: "up" })],
    })]);
  });
});
