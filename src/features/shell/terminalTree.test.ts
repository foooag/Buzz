import { describe, expect, it } from "vitest";
import {
  closePane,
  createPaneNode,
  findPane,
  replaceSessionId,
  splitPane,
  updateRatio,
} from "./terminalTree";

describe("terminal split tree", () => {
  it("splits a target pane and preserves both independent sessions", () => {
    const root = createPaneNode("pane-1", "session-1");

    const result = splitPane(
      root,
      "pane-1",
      createPaneNode("pane-2", "session-2"),
      "vertical",
      "split-1",
    );

    expect(result).toEqual({
      type: "split",
      id: "split-1",
      direction: "vertical",
      ratio: 0.5,
      first: createPaneNode("pane-1", "session-1"),
      second: createPaneNode("pane-2", "session-2"),
    });
  });

  it("collapses a split to the remaining sibling", () => {
    const root = splitPane(
      createPaneNode("pane-1", "session-1"),
      "pane-1",
      createPaneNode("pane-2", "session-2"),
      "horizontal",
      "split-1",
    );

    expect(closePane(root, "pane-1")).toEqual(
      createPaneNode("pane-2", "session-2"),
    );
    expect(closePane(createPaneNode("pane-1", "session-1"), "pane-1")).toBeNull();
  });

  it("constrains ratios and replaces restarted session identities", () => {
    const root = splitPane(
      createPaneNode("pane-1", "session-old"),
      "pane-1",
      createPaneNode("pane-2", "session-2"),
      "vertical",
      "split-1",
    );

    const constrained = updateRatio(root, "split-1", 0.95);
    const restarted = replaceSessionId(constrained, "session-old", "session-new");

    expect(constrained.type === "split" && constrained.ratio).toBe(0.8);
    expect(findPane(restarted, "pane-1")).toEqual(
      createPaneNode("pane-1", "session-new"),
    );
  });
});
