import { describe, expect, it } from "vitest";
import { createPaneNode } from "@/features/shell/terminalTree";
import {
  createTerminalStore,
  type TerminalSession,
} from "@/features/shell/terminalStore";

function session(id: string): TerminalSession {
  return {
    id,
    title: `Local Terminal ${id.slice(-1)}`,
    status: "connected",
    activePaneId: `pane-${id}`,
    root: createPaneNode(`pane-${id}`, id),
  };
}

describe("terminal store", () => {
  it("keeps stable order and cycles active sessions", () => {
    const store = createTerminalStore();
    store.getState().addSession(session("session-1"));
    store.getState().addSession(session("session-2"));
    store.getState().activateSession("session-1");

    store.getState().activateRelative(1);
    expect(store.getState().activeSessionId).toBe("session-2");
    store.getState().activateRelative(1);
    expect(store.getState().activeSessionId).toBe("session-1");
    store.getState().moveSession("session-2", -1);
    expect(store.getState().sessionOrder).toEqual(["session-2", "session-1"]);
  });

  it("splits the active pane and collapses it on close", () => {
    const store = createTerminalStore();
    store.getState().addSession(session("session-1"));

    store.getState().splitActivePane(
      createPaneNode("pane-2", "session-2"),
      "vertical",
      "split-1",
    );
    let active = store.getState().sessions["session-1"];
    expect(active.root.type).toBe("split");
    expect(active.activePaneId).toBe("pane-2");

    store.getState().closePane("session-1", "pane-2");
    active = store.getState().sessions["session-1"];
    expect(active.root).toEqual(createPaneNode("pane-session-1", "session-1"));
    expect(active.activePaneId).toBe("pane-session-1");
  });

  it("removes an empty workspace and activates its neighbor", () => {
    const store = createTerminalStore();
    store.getState().addSession(session("session-1"));
    store.getState().addSession(session("session-2"));
    store.getState().activateSession("session-1");

    store.getState().closePane("session-1", "pane-session-1");

    expect(store.getState().sessions["session-1"]).toBeUndefined();
    expect(store.getState().sessionOrder).toEqual(["session-2"]);
    expect(store.getState().activeSessionId).toBe("session-2");
  });
});
