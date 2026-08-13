import { afterEach, describe, expect, it, vi } from "vitest";
import { agentApi } from "../../../../src/renderer/features/agent/agentApi";

afterEach(() => {
  delete window.terminus;
});

describe("AgentClient MessagePort transport", () => {
  it("streams through the preload bridge and returns its stop function", () => {
    const stop = vi.fn();
    const streamAgent = vi.fn(() => stop);
    window.terminus = { streamAgent } as unknown as NonNullable<Window["terminus"]>;
    const onEvent = vi.fn();

    const result = agentApi.streamPrompt(
      "a1",
      "uptime",
      ["h1"],
      onEvent,
      "v1",
    );

    expect(result).toBe(stop);
    expect(streamAgent).toHaveBeenCalledWith({
      agentId: "a1",
      text: "uptime",
      targets: ["h1"],
      vaultId: "v1",
    }, expect.any(Function), undefined);
  });
});
