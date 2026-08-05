import type {
  PaneId,
  PaneNode,
  SessionId,
  SplitNode,
} from "./terminalTypes";

export function createPaneNode(
  paneId: PaneId,
  sessionId: SessionId,
): PaneNode {
  return { type: "pane", paneId, sessionId };
}

export function splitPane(
  root: SplitNode,
  targetPaneId: PaneId,
  newPane: PaneNode,
  direction: "horizontal" | "vertical",
  splitId: string,
): SplitNode {
  if (root.type === "pane") {
    if (root.paneId !== targetPaneId) return root;
    return {
      type: "split",
      id: splitId,
      direction,
      ratio: 0.5,
      first: root,
      second: newPane,
    };
  }

  const first = splitPane(
    root.first,
    targetPaneId,
    newPane,
    direction,
    splitId,
  );
  if (first !== root.first) return { ...root, first };

  const second = splitPane(
    root.second,
    targetPaneId,
    newPane,
    direction,
    splitId,
  );
  return second === root.second ? root : { ...root, second };
}

export function closePane(
  root: SplitNode,
  targetPaneId: PaneId,
): SplitNode | null {
  if (root.type === "pane") {
    return root.paneId === targetPaneId ? null : root;
  }

  const first = closePane(root.first, targetPaneId);
  const second = closePane(root.second, targetPaneId);
  if (!first) return second;
  if (!second) return first;
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

export function updateRatio(
  root: SplitNode,
  splitId: string,
  ratio: number,
): SplitNode {
  if (root.type === "pane") return root;
  if (root.id === splitId) {
    return { ...root, ratio: Math.min(0.8, Math.max(0.2, ratio)) };
  }

  const first = updateRatio(root.first, splitId, ratio);
  const second = updateRatio(root.second, splitId, ratio);
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

export function replaceSessionId(
  root: SplitNode,
  oldSessionId: SessionId,
  newSessionId: SessionId,
): SplitNode {
  if (root.type === "pane") {
    return root.sessionId === oldSessionId
      ? { ...root, sessionId: newSessionId }
      : root;
  }

  const first = replaceSessionId(root.first, oldSessionId, newSessionId);
  const second = replaceSessionId(root.second, oldSessionId, newSessionId);
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

export function findPane(
  root: SplitNode,
  paneId: PaneId,
): PaneNode | undefined {
  if (root.type === "pane") {
    return root.paneId === paneId ? root : undefined;
  }
  return findPane(root.first, paneId) ?? findPane(root.second, paneId);
}
