import { useCallback, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router";
import { create } from "zustand";
import { terminalApi, type TerminalApi } from "../features/shell/terminalApi";
import {
  terminalEventBus,
  terminalRuntimeRegistry,
  type ResizeObserverFactory,
  type TerminalRuntimeFactory,
} from "../features/shell/terminalRuntime";
import { useTerminalShortcuts } from "../features/shell/terminalShortcuts";
import { useTerminalStore } from "../features/shell/terminalStore";
import { defaultTerminalThemeId } from "../features/shell/terminalTheme";
import { createPaneNode } from "../features/shell/terminalTree";
import type {
  PaneNode,
  SplitNode,
  TerminalEvent,
} from "../features/shell/terminalTypes";
import { TerminalSessionStack } from "../features/shell/TerminalSessionStack";
import {
  inventoryApi,
  type InventoryApi,
} from "../features/inventory/inventoryApi";
import {
  forwardingApi,
  type ForwardingApi,
} from "../features/forwarding/forwardingApi";
import {
  createForwardingState,
  type ForwardingState,
} from "../features/forwarding/forwardingStore";
import { useInventoryStore } from "../features/inventory/inventoryStore";
import { HostKeyDialog } from "../features/ssh/HostKeyDialog";
import { sshApi, type SshApi } from "../features/ssh/sshApi";
import type { HostKeyPrompt } from "../features/ssh/sshTypes";
import { getHostCredential } from "../features/ssh/savedCredentials";
import { ServersPage } from "../features/servers/ServersPage";
import { SftpPanel } from "../features/sftp/SftpPanel";
import { sftpApi, type SftpApi } from "../features/sftp/sftpApi";
import {
  type Destination,
  WorkspaceShell,
} from "../features/workspace/WorkspaceShell";
import {
  HistoryPage,
  PortForwardingPage,
} from "../features/workspace/ResourcePages";
import {
  finishConnectionSession,
  markConnectionConnected,
  markConnectionFailed,
  recordConnectionAttempt,
  type HistoryEntry,
} from "../features/workspace/connectionHistory";
import {
  PreferencesWindow,
  type SectionId,
} from "../features/settings/PreferencesWindow";
import {
  loadTerminalPreferences,
  saveTerminalPreferences,
} from "../features/settings/terminalPreferences";
import { UpdateDialog } from "../features/updater/UpdateDialog";
import { updaterApi } from "../features/updater/updaterApi";
import { aiConfigApi } from "../features/ai/aiApi";
import type { AiConfigApi } from "../features/ai/aiConfigTypes";
import { AgentPage } from "../features/agent/AgentPage";
import { agentApi } from "../features/agent/agentApi";
import type { AgentClient } from "../features/agent/agentTypes";

type AppProps = {
  api?: TerminalApi;
  inventory?: InventoryApi;
  forwarding?: ForwardingApi;
  ssh?: SshApi;
  sftp?: SftpApi;
  aiConfig?: AiConfigApi;
  agentClient?: AgentClient;
  runtimeFactory?: TerminalRuntimeFactory;
  resizeObserverFactory?: ResizeObserverFactory;
};

export function App(props: AppProps = {}) {
  return (
    <HashRouter useTransitions={false}>
      <Routes>
        <Route path="*" element={<RoutedApp {...props} />} />
      </Routes>
    </HashRouter>
  );
}

function RoutedApp({
  api = terminalApi,
  inventory = inventoryApi,
  forwarding = forwardingApi,
  ssh = sshApi,
  sftp = sftpApi,
  aiConfig = aiConfigApi,
  agentClient = agentApi,
  runtimeFactory,
  resizeObserverFactory,
}: AppProps) {
  const navigate = useNavigate();
  const setDestination = useCallback(
    (next: Destination) => navigate(destinationPaths[next]),
    [navigate],
  );
  const [commandDrawerOpen, setCommandDrawerOpen] = useState(false);
  const [focusCommandSearch, setFocusCommandSearch] = useState(false);
  const [terminalSearchOpen, setTerminalSearchOpen] = useState(false);
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyPrompt | null>(
    null,
  );
  const [changedHostKeySession, setChangedHostKeySession] = useState<
    string | null
  >(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesSection, setPreferencesSection] = useState<
    SectionId | undefined
  >(undefined);
  const sshSessionIds = useRef(new Set<string>());
  const [themeId, setThemeId] = useState(
    () =>
      localStorage.getItem("terminus.terminalTheme") ?? defaultTerminalThemeId,
  );
  const [terminalPreferences, setTerminalPreferences] = useState(
    loadTerminalPreferences,
  );
  const forwardingStore = useMemo(
    () => create<ForwardingState>()(createForwardingState(forwarding)),
    [forwarding],
  );
  const sessionOrder = useTerminalStore((state) => state.sessionOrder);
  const sidebarCompact = useTerminalStore((state) => state.sidebarCompact);
  const addSession = useTerminalStore((state) => state.addSession);
  const removeSession = useTerminalStore((state) => state.removeSession);
  const activateSession = useTerminalStore((state) => state.activateSession);
  const activateRelative = useTerminalStore((state) => state.activateRelative);
  const setSidebarCompact = useTerminalStore(
    (state) => state.setSidebarCompact,
  );

  const openLocal = useCallback(async () => {
    try {
      const earlyEvents: TerminalEvent[] = [];
      let mounted = false;
      const opened = await api.open({ cols: 80, rows: 24 }, (event) => {
        forwardTerminalEvent(event);
        if (!mounted) earlyEvents.push(event);
      });
      const paneId = `pane-${opened.sessionId}`;
      addSession({
        id: opened.sessionId,
        title: opened.title,
        status: "connected",
        root: createPaneNode(paneId, opened.sessionId),
        activePaneId: paneId,
      });
      mounted = true;
      earlyEvents.forEach(updateTerminalStatus);
      setDestination("terminal");
    } catch {
      setDestination("servers");
    }
  }, [addSession, api]);

  const closeWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = useTerminalStore.getState().sessions[workspaceId];
      if (!workspace) return;
      await Promise.all(
        collectSessionIds(workspace.root).map((id) => api.close(id)),
      );
      removeSession(workspaceId);
      if (useTerminalStore.getState().sessionOrder.length === 0)
        setDestination("servers");
    },
    [api, removeSession],
  );

  const closeActive = useCallback(() => {
    const workspaceId = useTerminalStore.getState().activeSessionId;
    if (!workspaceId) return;
    const workspace = useTerminalStore.getState().sessions[workspaceId];
    const pane = workspace
      ? findActivePane(workspace.root, workspace.activePaneId)
      : undefined;
    if (!pane) return;
    void api.close(pane.sessionId).then(() => {
      useTerminalStore.getState().closePane(workspaceId, pane.paneId);
      if (useTerminalStore.getState().sessionOrder.length === 0)
        setDestination("servers");
    });
  }, [api]);

  const shortcutActions = useMemo(
    () => ({
      openLocal: () => void openLocal(),
      openServers: () => setDestination("servers"),
      openPortForwarding: () => setDestination("forwarding"),
      closeActive,
      activateIndex: (index: number) => {
        const id = useTerminalStore.getState().sessionOrder[index];
        if (id) {
          activateSession(id);
          setDestination("terminal");
        }
      },
      activateRelative: (offset: number) => {
        activateRelative(offset);
        if (useTerminalStore.getState().activeSessionId)
          setDestination("terminal");
      },
      toggleCommands: (focusSearch: boolean) => {
        setFocusCommandSearch(focusSearch);
        setCommandDrawerOpen((open) => (focusSearch ? true : !open));
      },
      toggleSidebar: () =>
        setSidebarCompact(!useTerminalStore.getState().sidebarCompact),
      clearActive: () => {
        const activeId = useTerminalStore.getState().activeSessionId;
        const active = activeId
          ? useTerminalStore.getState().sessions[activeId]
          : undefined;
        if (active) terminalRuntimeRegistry.get(active.activePaneId)?.clear();
      },
      searchActive: () => setTerminalSearchOpen(true),
      copyActive: () => {
        const active = getActiveRuntime();
        if (!active) return;
        if (active.runtime.hasSelection()) {
          void navigator.clipboard
            ?.writeText(active.runtime.getSelection())
            .catch(() => undefined);
        } else {
          void api.write(active.pane.sessionId, new Uint8Array([3]));
        }
      },
      pasteActive: () => {
        const active = getActiveRuntime();
        if (!active) return;
        void navigator.clipboard
          ?.readText()
          .then((text) => active.runtime.paste(text))
          .catch(() => undefined);
      },
      selectAll: () => getActiveRuntime()?.runtime.selectAll(),
    }),
    [
      activateRelative,
      activateSession,
      closeActive,
      openLocal,
      setSidebarCompact,
    ],
  );
  useTerminalShortcuts(shortcutActions);

  const onThemeChange = (nextTheme: string) => {
    setThemeId(nextTheme);
    localStorage.setItem("terminus.terminalTheme", nextTheme);
  };

  const onSshEvent = useCallback((event: TerminalEvent) => {
    if (
      event.type === "connectionStateChanged" &&
      event.state === "disconnected"
    )
      finishConnectionSession(event.sessionId);
    if (event.type === "hostKeyVerificationRequired") setHostKeyPrompt(event);
    if (event.type === "error" && event.error.code === "HOST_KEY_CHANGED")
      setChangedHostKeySession(event.sessionId);
    if (event.type === "reconnectAvailable") {
      const state = useTerminalStore.getState();
      const workspace = Object.values(state.sessions).find((candidate) =>
        collectSessionIds(candidate.root).includes(event.sessionId),
      );
      if (workspace) state.setStatus(workspace.id, "error");
    }
    forwardTerminalEvent(event);
  }, []);

  const onSshOpened = useCallback(
    (opened: { sessionId: string; title: string }) => {
      const paneId = `pane-${opened.sessionId}`;
      sshSessionIds.current.add(opened.sessionId);
      addSession({
        id: opened.sessionId,
        title: opened.title,
        status: "connected",
        root: createPaneNode(paneId, opened.sessionId),
        activePaneId: paneId,
      });
      setDestination("terminal");
    },
    [addSession],
  );

  const reconnectHistory = useCallback(
    (entry: HistoryEntry) => {
      const host = useInventoryStore.getState().hosts[entry.hostId];
      const credential = host ? getHostCredential(host) : null;
      if (!host || !credential) {
        setDestination("servers");
        return;
      }
      const historyId = recordConnectionAttempt({
        hostId: host.id,
        host: host.address,
        port: host.port ?? 22,
        username: host.username,
      });
      void ssh
        .open(
          {
            hostId: host.id,
            hostname: host.address,
            port: host.port ?? 22,
            username: host.username,
            authKind: credential.authKind,
            credentialRef: credential.credentialRef,
            identityId: null,
            keepaliveInterval: terminalPreferences.keepaliveInterval,
          },
          { cols: 80, rows: 24 },
          onSshEvent,
        )
        .then((opened) => {
          markConnectionConnected(historyId, opened.sessionId);
          onSshOpened(opened);
        })
        .catch(() => markConnectionFailed(historyId));
    },
    [onSshEvent, onSshOpened, ssh, terminalPreferences.keepaliveInterval],
  );

  const openRecentSession = useCallback(
    (entry: HistoryEntry) => {
      const sessionId = entry.sessionId;
      const live =
        entry.status === "connected" &&
        sessionId != null &&
        Boolean(useTerminalStore.getState().sessions[sessionId]);
      if (live) {
        activateSession(sessionId!);
        navigate(destinationPaths.terminal);
      } else {
        navigate(destinationPaths.history);
      }
    },
    [activateSession, navigate],
  );

  const restartSession = useCallback(
    async (sessionId: string, onEvent: (event: TerminalEvent) => void) => {
      if (sshSessionIds.current.has(sessionId)) {
        const opened = await ssh.reconnect(sessionId);
        sshSessionIds.current.delete(sessionId);
        sshSessionIds.current.add(opened.sessionId);
        return opened.sessionId;
      }
      await api.close(sessionId).catch(() => undefined);
      return (await api.open({ cols: 80, rows: 24 }, onEvent)).sessionId;
    },
    [api, ssh],
  );

  return (
    <>
      <WorkspaceShell
        onSessionActivate={(sessionId) => {
          activateSession(sessionId);
          setDestination("terminal");
        }}
        onSessionClose={(sessionId) => void closeWorkspace(sessionId)}
        onOpenSession={openRecentSession}
        sidebarCompact={sidebarCompact}
        onPreferences={() => setPreferencesOpen(true)}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/servers" replace />} />
          <Route
            path="/servers"
            element={
              <ServersPage
                inventoryApi={inventory}
                sshApi={ssh}
                forwardingApi={forwarding}
                onSshEvent={onSshEvent}
                onSshOpened={onSshOpened}
                sshKeepaliveInterval={terminalPreferences.keepaliveInterval}
                onSshStartup={async (sessionId, commands) => {
                  if (!commands.length) return;
                  const payload = new TextEncoder().encode(
                    `${commands.join("\n")}\n`,
                  );
                  await api.write(sessionId, payload);
                }}
              />
            }
          />
          <Route
            path="/agent"
            element={
              <AgentPage
                agentClient={agentClient}
                providerApi={aiConfig}
                onOpenServers={() => setDestination("servers")}
              />
            }
          />
          <Route
            path="/sftp"
            element={
              <SftpPanel
                api={sftp}
                keepaliveInterval={terminalPreferences.keepaliveInterval}
              />
            }
          />
          <Route
            path="/forwarding"
            element={
              <PortForwardingPage
                store={forwardingStore}
                keepaliveInterval={terminalPreferences.keepaliveInterval}
              />
            }
          />
          <Route
            path="/history"
            element={<HistoryPage onReconnect={reconnectHistory} />}
          />
          <Route
            path="/terminal"
            element={
              sessionOrder.length > 0 ? (
                <TerminalSessionStack
                  api={api}
                  eventBus={terminalEventBus}
                  runtimeFactory={runtimeFactory}
                  resizeObserverFactory={resizeObserverFactory}
                  themeId={themeId}
                  onThemeChange={onThemeChange}
                  commandDrawerOpen={commandDrawerOpen}
                  focusCommandSearch={focusCommandSearch}
                  onCommandDrawerChange={setCommandDrawerOpen}
                  terminalSearchOpen={terminalSearchOpen}
                  onTerminalSearchChange={setTerminalSearchOpen}
                  onTerminalEvent={forwardTerminalEvent}
                  restartSession={restartSession}
                  onEmpty={() => setDestination("servers")}
                  terminalPreferences={terminalPreferences}
                  aiConfigApi={aiConfig}
                  isSshSession={(sessionId: string) =>
                    sshSessionIds.current.has(sessionId)
                  }
                />
              ) : (
                <Navigate to="/servers" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/servers" replace />} />
        </Routes>
      </WorkspaceShell>
      <HostKeyDialog
        api={ssh}
        pending={hostKeyPrompt ?? undefined}
        changed={
          changedHostKeySession
            ? { sessionId: changedHostKeySession }
            : undefined
        }
        onClose={() => {
          setHostKeyPrompt(null);
          setChangedHostKeySession(null);
        }}
      />
      <PreferencesWindow
        open={preferencesOpen}
        onClose={() => {
          setPreferencesOpen(false);
        }}
        inventoryApi={inventory}
        sftpApi={sftp}
        sshApi={ssh}
        aiConfigApi={aiConfig}
        terminalThemeId={themeId}
        onTerminalThemeChange={onThemeChange}
        terminalPreferences={terminalPreferences}
        onTerminalPreferencesChange={(next) => {
          setTerminalPreferences(next);
          saveTerminalPreferences(next);
        }}
        initialSection={preferencesSection}
        updater={updaterApi}
      />
      <UpdateDialog />
    </>
  );
}

const destinationPaths: Record<Destination, string> = {
  servers: "/servers",
  agent: "/agent",
  "lexical-test": "/lexical-test",
  "tiptap-test": "/tiptap-test",
  sftp: "/sftp",
  forwarding: "/forwarding",
  history: "/history",
  terminal: "/terminal",
};

function collectSessionIds(root: SplitNode): string[] {
  return root.type === "pane"
    ? [root.sessionId]
    : [...collectSessionIds(root.first), ...collectSessionIds(root.second)];
}

function findActivePane(root: SplitNode, paneId: string): PaneNode | undefined {
  if (root.type === "pane") return root.paneId === paneId ? root : undefined;
  return (
    findActivePane(root.first, paneId) ?? findActivePane(root.second, paneId)
  );
}

function getActiveRuntime() {
  const workspaceId = useTerminalStore.getState().activeSessionId;
  const workspace = workspaceId
    ? useTerminalStore.getState().sessions[workspaceId]
    : undefined;
  if (!workspace) return undefined;
  const pane = findActivePane(workspace.root, workspace.activePaneId);
  const runtime = terminalRuntimeRegistry.get(workspace.activePaneId);
  return pane && runtime ? { pane, runtime } : undefined;
}

function forwardTerminalEvent(event: TerminalEvent) {
  terminalEventBus.emit(event);
  updateTerminalStatus(event);
}

function updateTerminalStatus(event: TerminalEvent) {
  if (event.type !== "exit" && event.type !== "error") return;
  const state = useTerminalStore.getState();
  const workspace = Object.values(state.sessions).find((candidate) =>
    collectSessionIds(candidate.root).includes(event.sessionId),
  );
  if (workspace)
    state.setStatus(workspace.id, event.type === "exit" ? "exited" : "error");
}
