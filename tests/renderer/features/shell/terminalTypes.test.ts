import { describe, expect, it } from "vitest";
import { isTerminalEvent } from "@/features/shell/terminalTypes";

describe("isTerminalEvent", () => {
  it("accepts valid byte output and exit events", () => {
    expect(
      isTerminalEvent({
        type: "output",
        sessionId: "session-1",
        data: [0, 27, 255],
      }),
    ).toBe(true);
    expect(
      isTerminalEvent({
        type: "exit",
        sessionId: "session-1",
        exitCode: 0,
      }),
    ).toBe(true);
  });

  it("rejects malformed events before they reach xterm", () => {
    expect(
      isTerminalEvent({
        type: "output",
        sessionId: "session-1",
        data: [256],
      }),
    ).toBe(false);
    expect(
      isTerminalEvent({ type: "error", sessionId: "", error: null }),
    ).toBe(false);
    expect(isTerminalEvent("terminal output")).toBe(false);
  });
});
