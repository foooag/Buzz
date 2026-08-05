import { create } from "zustand";
import { createStore, type StateCreator } from "zustand/vanilla";
import {
  closePane as closePaneFromTree,
  findPane,
  replaceSessionId,
  splitPane,
  updateRatio,
} from "./terminalTree";
import type { PaneId, PaneNode, SessionId, SplitNode } from "./terminalTypes";

export type TerminalStatus = "connecting" | "connected" | "exited" | "error";

export type TerminalSession = {
  id: string;
  title: string;
  status: TerminalStatus;
  root: SplitNode;
  activePaneId: PaneId;
};

export type TerminalStore = {
  sessions: Record<string, TerminalSession>;
  sessionOrder: string[];
  activeSessionId: string | null;
  sidebarCompact: boolean;
  addSession: (session: TerminalSession) => void;
  removeSession: (sessionId: string) => void;
  activateSession: (sessionId: string) => void;
  activateRelative: (offset: number) => void;
  moveSession: (sessionId: string, offset: number) => void;
  splitActivePane: (
    pane: PaneNode,
    direction: "horizontal" | "vertical",
    splitId: string,
  ) => void;
  closePane: (workspaceId: string, paneId: PaneId) => void;
  updateSplitRatio: (workspaceId: string, splitId: string, ratio: number) => void;
  setActivePane: (workspaceId: string, paneId: PaneId) => void;
  replaceSession: (workspaceId: string, oldId: SessionId, newId: SessionId) => void;
  setStatus: (workspaceId: string, status: TerminalStatus) => void;
  setSidebarCompact: (compact: boolean) => void;
};

const createTerminalState: StateCreator<TerminalStore> = (set, get) => ({
  sessions: {},
  sessionOrder: [],
  activeSessionId: null,
  sidebarCompact: false,

  addSession: (session) =>
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
      sessionOrder: state.sessionOrder.includes(session.id)
        ? state.sessionOrder
        : [...state.sessionOrder, session.id],
      activeSessionId: session.id,
    })),

  removeSession: (sessionId) =>
    set((state) => removeWorkspace(state, sessionId)),

  activateSession: (sessionId) => {
    if (get().sessions[sessionId]) set({ activeSessionId: sessionId });
  },

  activateRelative: (offset) =>
    set((state) => {
      if (state.sessionOrder.length === 0) return state;
      const currentIndex = Math.max(
        0,
        state.sessionOrder.indexOf(state.activeSessionId ?? ""),
      );
      const length = state.sessionOrder.length;
      const nextIndex = ((currentIndex + offset) % length + length) % length;
      return { activeSessionId: state.sessionOrder[nextIndex] };
    }),

  moveSession: (sessionId, offset) =>
    set((state) => {
      const currentIndex = state.sessionOrder.indexOf(sessionId);
      if (currentIndex < 0) return state;
      const nextIndex = Math.min(
        state.sessionOrder.length - 1,
        Math.max(0, currentIndex + offset),
      );
      if (currentIndex === nextIndex) return state;
      const sessionOrder = [...state.sessionOrder];
      sessionOrder.splice(currentIndex, 1);
      sessionOrder.splice(nextIndex, 0, sessionId);
      return { sessionOrder };
    }),

  splitActivePane: (pane, direction, splitId) =>
    set((state) => {
      const workspaceId = state.activeSessionId;
      if (!workspaceId) return state;
      const workspace = state.sessions[workspaceId];
      if (!workspace) return state;
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: {
            ...workspace,
            root: splitPane(
              workspace.root,
              workspace.activePaneId,
              pane,
              direction,
              splitId,
            ),
            activePaneId: pane.paneId,
          },
        },
      };
    }),

  closePane: (workspaceId, paneId) =>
    set((state) => {
      const workspace = state.sessions[workspaceId];
      if (!workspace) return state;
      const root = closePaneFromTree(workspace.root, paneId);
      if (!root) return removeWorkspace(state, workspaceId);
      const activePaneId = findPane(root, workspace.activePaneId)
        ? workspace.activePaneId
        : firstPane(root).paneId;
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: { ...workspace, root, activePaneId },
        },
      };
    }),

  updateSplitRatio: (workspaceId, splitId, ratio) =>
    set((state) => {
      const workspace = state.sessions[workspaceId];
      if (!workspace) return state;
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: {
            ...workspace,
            root: updateRatio(workspace.root, splitId, ratio),
          },
        },
      };
    }),

  setActivePane: (workspaceId, paneId) =>
    set((state) => {
      const workspace = state.sessions[workspaceId];
      if (!workspace || !findPane(workspace.root, paneId)) return state;
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: { ...workspace, activePaneId: paneId },
        },
      };
    }),

  replaceSession: (workspaceId, oldId, newId) =>
    set((state) => {
      const workspace = state.sessions[workspaceId];
      if (!workspace) return state;
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: {
            ...workspace,
            root: replaceSessionId(workspace.root, oldId, newId),
            status: "connected",
          },
        },
      };
    }),

  setStatus: (workspaceId, status) =>
    set((state) => {
      const workspace = state.sessions[workspaceId];
      if (!workspace) return state;
      return {
        sessions: {
          ...state.sessions,
          [workspaceId]: { ...workspace, status },
        },
      };
    }),

  setSidebarCompact: (sidebarCompact) => set({ sidebarCompact }),
});

export function createTerminalStore() {
  return createStore<TerminalStore>()(createTerminalState);
}

export const useTerminalStore = create<TerminalStore>()(createTerminalState);

export function resetTerminalStore() {
  useTerminalStore.setState({
    sessions: {},
    sessionOrder: [],
    activeSessionId: null,
    sidebarCompact: false,
  });
}

function removeWorkspace(
  state: Pick<
    TerminalStore,
    "sessions" | "sessionOrder" | "activeSessionId"
  >,
  sessionId: string,
) {
  const index = state.sessionOrder.indexOf(sessionId);
  if (index < 0) return state;
  const sessions = { ...state.sessions };
  delete sessions[sessionId];
  const sessionOrder = state.sessionOrder.filter((id) => id !== sessionId);
  const activeSessionId =
    state.activeSessionId === sessionId
      ? (sessionOrder[index] ?? sessionOrder[index - 1] ?? null)
      : state.activeSessionId;
  return { sessions, sessionOrder, activeSessionId };
}

function firstPane(root: SplitNode): PaneNode {
  return root.type === "pane" ? root : firstPane(root.first);
}
