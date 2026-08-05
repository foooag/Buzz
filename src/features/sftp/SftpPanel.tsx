import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  History,
  Server,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { sftpApi, type SftpApi } from "./sftpApi";
import { ConflictDialog } from "./ConflictDialog";
import { OpenWithDialog } from "./OpenWithDialog";
import { createSftpStore } from "./sftpStore";
import { FilePane } from "./FilePane";
import { TransferList } from "./TransferList";
import { SftpSettings } from "../settings/SftpSettings";
import type { SftpSourceOption } from "./SourcePicker";
import type { Entry } from "./EntryTable";
import type {
  Association,
  CreateSshProfile,
  LocalEntry,
  RemoteEntry,
  SftpSessionEvent,
  SftpSessionId,
} from "./sftpTypes";
import {
  SFTP_HOST_SEED,
  SFTP_RECENT,
  type SftpHost,
  type SftpRecent,
} from "./sftpHostSeed";
import { useInventoryStore } from "../inventory/inventoryStore";
import { getHostCredential } from "../ssh/savedCredentials";

type SftpPanelProps = {
  api?: SftpApi;
  keepaliveInterval?: number;
};

/** A source is either the local filesystem or a host ID. */
type PaneSource = "local" | string;

/**
 * Dual-pane SFTP file manager matching the design prototype:
 * designs/terminal-ai-mode/views.jsx SftpView.
 *
 * Until a session is open it renders the connect surface. Once connected it
 * renders two vertically-stacked FilePane components, each with an independent
 * SourcePicker that can switch between local filesystem and any SSH host.
 */
export function SftpPanel({ api = sftpApi, keepaliveInterval = 30 }: SftpPanelProps = {}) {
  const useStore = useMemo(() => createSftpStore(api), [api]);
  const store = useStore;

  const sessions = useStore((state) => state.sessions);
  const remoteEntriesBySession = useStore((state) => state.remoteEntriesBySession);
  const localEntries = useStore((state) => state.localEntries);
  const remoteCwds = useStore((state) => state.remoteCwds);
  const localCwd = useStore((state) => state.localCwd);
  const error = useStore((state) => state.error);
  const transfers = useStore((state) => state.transfers);
  const activeConflict = useStore((state) => state.activeConflict);
  const activeOpenWithConflict = useStore((state) => state.activeOpenWithConflict);
  const watchers = useStore((state) => state.watchers);

  const refreshRemote = useStore((state) => state.refreshRemote);
  const refreshLocal = useStore((state) => state.refreshLocal);
  const enqueueUpload = useStore((state) => state.enqueueUpload);
  const enqueueDownload = useStore((state) => state.enqueueDownload);

  // ------------------------------------------------------------------
  // Per-pane source: "local" or a host ID. The host ID → session
  // mapping lives in `hostSessionMap`.
  // ------------------------------------------------------------------
  const [topSource, setTopSource] = useState<PaneSource>("local");
  const [bottomSource, setBottomSource] = useState<PaneSource>("local");

  // ------------------------------------------------------------------
  // Host list
  // ------------------------------------------------------------------
  const inventoryHosts = useInventoryStore((state) => state.hosts);
  const hosts = useMemo<SftpHost[]>(() => {
    const live = Object.values(inventoryHosts)
      .filter((h) => !h.protocol || h.protocol === "ssh")
      .map((h) => ({
        id: h.id,
        name: h.name,
        address: h.address,
        username: h.username,
        port: h.port ?? null,
        identity: h.identity ?? null,
        authKind: h.authKind,
        credentialRef: h.credentialRef ?? null,
        status: h.status,
      }));
    return live.length > 0 ? live : api === sftpApi ? [] : SFTP_HOST_SEED;
  }, [api, inventoryHosts]);

  /** Map host id → session id so we can reuse sessions across pane switches. */
  const [hostSessionMap, setHostSessionMap] = useState<Record<string, SftpSessionId>>({});

  // ------------------------------------------------------------------
  // Connect-surface state
  // ------------------------------------------------------------------
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingHostKey, setPendingHostKey] = useState<
    Extract<SftpSessionEvent, { type: "hostKeyVerificationRequired" }> | null
  >(null);

  // ------------------------------------------------------------------
  // Open-With + associations
  // ------------------------------------------------------------------
  const [openWithPath, setOpenWithPath] = useState<string | null>(null);
  const [openWithWatcherId, setOpenWithWatcherId] = useState<string | null>(null);
  const [showAssociations, setShowAssociations] = useState(false);
  const [associations, setAssociations] = useState<Association[]>([]);

  const loadAssociations = useCallback(async () => {
    try {
      const next = await api.listAssociations();
      setAssociations(next);
    } catch {
      setAssociations([]);
    }
  }, [api]);

  useEffect(() => {
    if (showAssociations) void loadAssociations();
  }, [showAssociations, loadAssociations]);

  const handleDeleteAssociation = useCallback(
    async (extension: string) => {
      await api.deleteAssociation(extension);
      await loadAssociations();
    },
    [api, loadAssociations],
  );

  const openWithWatcher = openWithWatcherId ? watchers[openWithWatcherId] ?? null : null;
  const [pendingLocalPaths, setPendingLocalPaths] = useState<string[]>([]);

  // ------------------------------------------------------------------
  // Error
  // ------------------------------------------------------------------
  const visibleError = connectError ?? error;
  const dismissError = useCallback(() => {
    setConnectError(null);
    store.getState().clearError();
  }, [store]);

  // ------------------------------------------------------------------
  // Resolve a pane source to the active session (if any)
  // ------------------------------------------------------------------
  const sessionForHost = useCallback(
    (hostId: string): SftpSessionId | null => {
      const sessionId = hostSessionMap[hostId];
      if (sessionId && sessions[sessionId]) return sessionId;
      return null;
    },
    [hostSessionMap, sessions],
  );

  // ------------------------------------------------------------------
  // Connection helpers
  // ------------------------------------------------------------------
  const openSessionForHost = useCallback(
    async (host: SftpHost): Promise<SftpSessionId | null> => {
      setConnecting(true);
      setConnectError(null);
      try {
        const savedCredential = getHostCredential(host);
        const isLiveInventoryHost = Boolean(inventoryHosts[host.id]);
        if (isLiveInventoryHost && !savedCredential) {
          setConnectError("Save a password or private key for this host in Servers before opening SFTP.");
          return null;
        }
        const profile: CreateSshProfile = {
          hostId: host.id,
          hostname: host.address,
          port: host.port ?? 22,
          username: host.username || "user",
          authKind: savedCredential?.authKind ?? "password",
          credentialRef: savedCredential?.credentialRef ?? `sftp-host-${host.id}`,
          identityId: null,
          keepaliveInterval,
        };
        const sessionId = await store.getState().open(profile, (event) => {
          if (event.type === "hostKeyVerificationRequired") {
            setPendingHostKey(event);
          }
        });
        setHostSessionMap((prev) => ({ ...prev, [host.id]: sessionId }));
        return sessionId;
      } catch {
        setConnectError("The SFTP connection could not be opened.");
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [api, inventoryHosts, keepaliveInterval, store],
  );

  const ensureSession = useCallback(
    async (hostId: string): Promise<SftpSessionId | null> => {
      const existing = sessionForHost(hostId);
      if (existing) return existing;
      const host = hosts.find((h) => h.id === hostId);
      if (!host) return null;
      return openSessionForHost(host);
    },
    [hosts, sessionForHost, openSessionForHost],
  );

  const handleConnect = useCallback(
    async (host: SftpHost | undefined, path: string) => {
      if (!host || connecting) return;
      const sessionId = await ensureSession(host.id);
      if (!sessionId) return;
      const remotePath = path.trim() || "/";
      setTopSource(host.id);
      setBottomSource("local");
      await store.getState().refreshRemote(sessionId, remotePath);
      await store.getState().refreshLocal("/");
    },
    [connecting, ensureSession, store],
  );

  const decideHostKey = useCallback(
    async (trust: boolean) => {
      const pending = pendingHostKey;
      if (!pending) return;
      setPendingHostKey(null);
      try {
        await api.decideHostKey(pending.sessionId, trust);
      } catch {
        if (trust) setConnectError("The SFTP host key decision could not be applied.");
      }
    },
    [api, pendingHostKey],
  );

  const disconnect = useCallback(async () => {
    for (const sid of Object.values(hostSessionMap)) {
      await store.getState().close(sid);
    }
    setHostSessionMap({});
    setTopSource("local");
    setBottomSource("local");
  }, [hostSessionMap, store]);

  // ------------------------------------------------------------------
  // Source switching (when a user picks a different host in a pane)
  // ------------------------------------------------------------------
  const handleSourceChange = useCallback(
    async (pane: "top" | "bottom", source: SftpSourceOption) => {
      if (source.kind === "local") {
        if (pane === "top") setTopSource("local");
        else setBottomSource("local");
        await store.getState().refreshLocal(localCwd);
        return;
      }

      // Remote source: source.id is the host ID
      const sessionId = await ensureSession(source.id);
      if (!sessionId) return;

      if (pane === "top") setTopSource(source.id);
      else setBottomSource(source.id);

      const cwd = remoteCwds[sessionId] || "/";
      await store.getState().refreshRemote(sessionId, cwd);
    },
    [ensureSession, setTopSource, setBottomSource, store, localCwd, remoteCwds],
  );

  // ------------------------------------------------------------------
  // Build source options for SourcePicker
  // ------------------------------------------------------------------
  const sourceOptions = useMemo<SftpSourceOption[]>(() => {
    const options: SftpSourceOption[] = [
      {
        id: "local",
        label: "Local",
        sublabel: localCwd,
        kind: "local",
        online: true,
      },
    ];
    for (const host of hosts) {
      options.push({
        id: host.id,
        label: host.name,
        sublabel: `${host.username}@${host.address}`,
        kind: "remote",
        online: host.status !== "offline",
      });
    }
    return options;
  }, [hosts, localCwd]);

  const getSourceForId = useCallback(
    (sourceId: PaneSource): SftpSourceOption => {
      if (sourceId === "local") return sourceOptions[0];
      const host = hosts.find((h) => h.id === sourceId);
      if (host) {
        return {
          id: host.id,
          label: host.name,
          sublabel: `${host.username}@${host.address}`,
          kind: "remote",
          online: host.status !== "offline",
        };
      }
      return sourceOptions[0];
    },
    [hosts, sourceOptions],
  );

  const toEntry = useCallback((e: RemoteEntry | LocalEntry): Entry => ({
    name: e.name,
    isDir: e.isDir,
    size: e.size,
    modified: e.modified,
    permissions: e.permissions !== null && e.permissions !== undefined
      ? formatPermissions(e.permissions, e.isDir)
      : null,
  }), []);

  const handleCancelTransfer = useCallback(
    (transferId: string) => {
      void api.cancelTransfer(transferId);
    },
    [api],
  );

  // ------------------------------------------------------------------
  // Render: disconnected vs connected
  // ------------------------------------------------------------------
  const isConnected = topSource !== "local" && sessionForHost(topSource) !== null;

  if (!isConnected) {
    return (
      <>
        <SftpConnectShell
          hosts={hosts}
          recents={api === sftpApi ? [] : SFTP_RECENT}
          connecting={connecting}
          error={visibleError}
          onDismissError={dismissError}
          onConnect={(hostId, path) => {
            const host = hosts.find((h) => h.id === hostId);
            void handleConnect(host, path);
          }}
          onConnectRecent={(recent) => {
            const host = hosts.find((h) => h.name === recent.host);
            void handleConnect(host, recent.path);
          }}
        />
        {pendingHostKey ? (
          <SftpHostKeyDialog
            prompt={pendingHostKey}
            onDecision={(trust) => void decideHostKey(trust)}
          />
        ) : null}
      </>
    );
  }

  // Derive entries per pane
  const topSourceObj = getSourceForId(topSource);
  const topSessionId = sessionForHost(topSource);
  const topEntries: Entry[] = topSourceObj.kind === "local"
    ? localEntries.map(toEntry)
    : topSessionId ? (remoteEntriesBySession[topSessionId] ?? []).map(toEntry) : [];
  const topCwd = topSourceObj.kind === "local"
    ? localCwd
    : topSessionId ? (remoteCwds[topSessionId] ?? "/") : "/";

  const bottomSourceObj = getSourceForId(bottomSource);
  const bottomSessionId = sessionForHost(bottomSource);
  const bottomEntries: Entry[] = bottomSourceObj.kind === "local"
    ? localEntries.map(toEntry)
    : bottomSessionId ? (remoteEntriesBySession[bottomSessionId] ?? []).map(toEntry) : [];
  const bottomCwd = bottomSourceObj.kind === "local"
    ? localCwd
    : bottomSessionId ? (remoteCwds[bottomSessionId] ?? "/") : "/";

  /** The session ID to use for actions that target the top pane's host. */
  const topRemoteSessionId = topSourceObj.kind === "remote" ? topSessionId : null;
  /** The session ID for the other pane's remote host, for cross-pane operations. */
  const bottomRemoteSessionId = bottomSourceObj.kind === "remote" ? bottomSessionId : null;

  return (
    <section className="flex h-screen flex-col overflow-hidden bg-void" data-testid="sftp-panel">
      <SftpPageHeader
        subtitle="Dual-pane transfer · pick any source from each pane header"
        actions={
          <>
            <button
              type="button"
              aria-label="Transfer"
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <ArrowUpDown size={14} />
              Transfer
            </button>
            <button
              type="button"
              aria-label="Disconnect"
              title="Disconnect"
              onClick={() => void disconnect()}
              className="grid h-8 w-8 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <X size={16} />
            </button>
          </>
        }
      />

      {visibleError ? (
        <div className="px-5 pb-2.5">
          <div className="flex items-start gap-2.5 rounded-xl border border-coral-red/30 bg-coral-red/[0.06] px-3.5 py-3">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-coral-red" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[12.5px] font-semibold text-coral-red">Couldn't connect</p>
              <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-fog">{visibleError}</p>
            </div>
            <button
              type="button"
              onClick={dismissError}
              className="shrink-0 rounded-md border border-coral-red/30 px-2.5 py-1 text-[11.5px] text-coral-red transition-colors hover:bg-coral-red/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_1fr] gap-2.5 overflow-hidden px-5 pb-5">
        <FilePane
          key={`top-${topSource}`}
          source={topSourceObj}
          sources={sourceOptions}
          onSourceChange={(s) => void handleSourceChange("top", s)}
          entries={topEntries}
          busy={false}
          onNavigate={(name) => {
            const newPath = joinCwd(topCwd, name);
            if (topSourceObj.kind === "local") {
              void refreshLocal(newPath);
            } else if (topRemoteSessionId) {
              void refreshRemote(topRemoteSessionId, newPath);
            }
          }}
          onRefresh={() => {
            if (topSourceObj.kind === "local") {
              void refreshLocal(topCwd);
            } else if (topRemoteSessionId) {
              void refreshRemote(topRemoteSessionId, topCwd);
            }
          }}
          onUpload={
            topSourceObj.kind === "remote"
              ? () => {
                  if (topRemoteSessionId) {
                    void enqueueUpload(topRemoteSessionId, pendingLocalPaths, topCwd);
                    setPendingLocalPaths([]);
                  }
                }
              : undefined
          }
          onDownload={
            topSourceObj.kind === "local"
              ? () => {
                  const sid = bottomRemoteSessionId;
                  if (sid) void enqueueDownload(sid, [], localCwd);
                }
              : undefined
          }
          onNewFolder={
            topSourceObj.kind === "remote" && topRemoteSessionId
              ? () => { void api.mkdirRemote(topRemoteSessionId, joinCwd(topCwd, "new-folder")); }
              : undefined
          }
        />
        <FilePane
          key={`bottom-${bottomSource}`}
          source={bottomSourceObj}
          sources={sourceOptions}
          onSourceChange={(s) => void handleSourceChange("bottom", s)}
          entries={bottomEntries}
          busy={false}
          onNavigate={(name) => {
            const newPath = joinCwd(bottomCwd, name);
            if (bottomSourceObj.kind === "local") {
              void refreshLocal(newPath);
            } else if (bottomRemoteSessionId) {
              void refreshRemote(bottomRemoteSessionId, newPath);
            }
          }}
          onRefresh={() => {
            if (bottomSourceObj.kind === "local") {
              void refreshLocal(bottomCwd);
            } else if (bottomRemoteSessionId) {
              void refreshRemote(bottomRemoteSessionId, bottomCwd);
            }
          }}
          onUpload={
            bottomSourceObj.kind === "remote"
              ? () => {
                  if (bottomRemoteSessionId) {
                    void enqueueUpload(bottomRemoteSessionId, pendingLocalPaths, bottomCwd);
                    setPendingLocalPaths([]);
                  }
                }
              : undefined
          }
          onDownload={
            bottomSourceObj.kind === "local"
              ? () => {
                  const sid = topRemoteSessionId;
                  if (sid) void enqueueDownload(sid, [], localCwd);
                }
              : undefined
          }
          onNewFolder={
            bottomSourceObj.kind === "remote" && bottomRemoteSessionId
              ? () => { void api.mkdirRemote(bottomRemoteSessionId, joinCwd(bottomCwd, "new-folder")); }
              : undefined
          }
        />
      </div>
      <footer className="border-t border-graphite bg-carbon px-5 py-2" data-testid="sftp-transfer-dock">
        <TransferList transfers={transfers} onCancelTransfer={handleCancelTransfer} />
      </footer>
      <ConflictDialog
        open={Boolean(activeConflict)}
        transferId={activeConflict?.transferId ?? ""}
        itemId={activeConflict?.itemId ?? ""}
        targetName={
          activeConflict
            ? activeConflict.kind.kind === "targetExists"
              ? activeConflict.kind.targetName
              : activeConflict.kind.remoteName
            : ""
        }
        kind={activeConflict?.kind}
        onResolve={(_transferId, _itemId, resolution) => {
          void store.getState().resolveConflict(resolution);
        }}
      />
      <OpenWithDialog
        open={openWithPath !== null}
        sessionId={topRemoteSessionId ?? ""}
        remotePath={openWithPath ?? ""}
        api={api}
        associations={associations}
        watcherStatus={openWithWatcher?.status}
        activeConflict={
          activeOpenWithConflict && openWithWatcher &&
          activeOpenWithConflict.watcherId === openWithWatcher.watcherId
            ? activeOpenWithConflict
            : null
        }
        onLaunched={(watcherId) => setOpenWithWatcherId(watcherId)}
        onResolveConflict={(resolution) => {
          void store.getState().resolveOpenWithConflict(resolution);
        }}
        onClose={() => {
          if (openWithWatcherId) {
            void store.getState().closeOpenWith(openWithWatcherId);
          }
          setOpenWithWatcherId(null);
          setOpenWithPath(null);
        }}
      />
      {showAssociations ? (
        <AssociationsModal
          associations={associations}
          onClose={() => setShowAssociations(false)}
          onDelete={handleDeleteAssociation}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Host-key dialog
// ---------------------------------------------------------------------------

function SftpHostKeyDialog({
  prompt,
  onDecision,
}: {
  prompt: Extract<SftpSessionEvent, { type: "hostKeyVerificationRequired" }>;
  onDecision: (trust: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-void/75 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Verify SFTP host key"
        className="w-full max-w-[460px] rounded-xl border border-graphite bg-carbon p-5 shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
      >
        <h2 className="m-0 text-[16px] font-semibold text-paper">Verify SFTP host key</h2>
        <p className="mt-2 text-[12px] text-fog">
          Compare this fingerprint through a trusted channel before connecting.
        </p>
        <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12px]">
          <dt className="text-fog">Host</dt>
          <dd className="m-0 font-mono text-mist">{prompt.host}:{prompt.port}</dd>
          <dt className="text-fog">Algorithm</dt>
          <dd className="m-0 font-mono text-mist">{prompt.algorithm}</dd>
          <dt className="text-fog">Fingerprint</dt>
          <dd className="m-0 break-all font-mono text-mist">{prompt.fingerprint}</dd>
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onDecision(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onDecision(true)}>
            Trust and connect
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

function SftpPageHeader({
  subtitle,
  actions,
}: {
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-mist">
          <FolderOpen size={16} />
        </span>
        <div className="min-w-0">
          <h1 className="m-0 text-[16px] font-semibold tracking-tight text-paper">SFTP</h1>
          <p className="m-0 mt-0.5 text-[12px] text-fog">{subtitle}</p>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect shell (disconnected state)
// ---------------------------------------------------------------------------

function SftpConnectShell({
  hosts,
  recents,
  connecting,
  error,
  onDismissError,
  onConnect,
  onConnectRecent,
}: {
  hosts: SftpHost[];
  recents: SftpRecent[];
  connecting: boolean;
  error: string | null;
  onDismissError(): void;
  onConnect(hostId: string, path: string): void;
  onConnectRecent(recent: SftpRecent): void;
}) {
  const [draftHostId, setDraftHostId] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const canConnect = Boolean(draftHostId) && !connecting;

  return (
    <section className="flex h-screen flex-col overflow-hidden bg-void" data-testid="sftp-panel">
      <SftpPageHeader subtitle="Transfer files between your machine and connected hosts" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6" data-testid="sftp-connect-form">
        <div className="mx-auto max-w-[680px]">
          <div className="flex items-center gap-2 rounded-xl border border-graphite bg-obsidian/50 px-3 py-1.5 transition-colors focus-within:border-smoke">
            <Server size={15} className="shrink-0 text-fog" />
            <label className="sr-only" htmlFor="sftp-host-select">Host</label>
            <select
              id="sftp-host-select"
              value={draftHostId}
              onChange={(event) => setDraftHostId(event.target.value)}
              className="shrink-0 bg-transparent text-[12.5px] text-mist outline-none"
            >
              <option value="" disabled>Choose a host…</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.username ? `${h.username}@` : ""}{h.name}
                </option>
              ))}
            </select>
            <span className="text-fog/40">·</span>
            <span className="shrink-0 text-[11px] text-fog/70">path</span>
            <input
              value={draftPath}
              onChange={(event) => setDraftPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canConnect) {
                  event.preventDefault();
                  onConnect(draftHostId, draftPath);
                }
              }}
              placeholder="/var/www/shop"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-mist outline-none placeholder:text-fog/45"
            />
            <button
              type="button"
              onClick={() => onConnect(draftHostId, draftPath)}
              disabled={!canConnect}
              className={
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold tracking-tight transition disabled:opacity-50 " +
                (!canConnect
                  ? "bg-graphite text-fog cursor-not-allowed"
                  : "bg-acid-lime text-void hover:brightness-105")
              }
            >
              {connecting ? (
                <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-void/30 border-t-void" />
              ) : (
                <ExternalLink size={13} />
              )}
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </div>

          {error ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-coral-red/30 bg-coral-red/[0.06] px-3.5 py-3">
              <CircleAlert size={16} className="mt-0.5 shrink-0 text-coral-red" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[12.5px] font-semibold text-coral-red">Couldn't connect</p>
                <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-fog">{error}</p>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                className="shrink-0 rounded-md border border-coral-red/30 px-2.5 py-1 text-[11.5px] text-coral-red transition-colors hover:bg-coral-red/10"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {connecting ? (
            <p className="m-0 mt-3 flex items-center gap-2 text-[12px] text-fog">
              <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-fog/25 border-t-fog" />
              Opening SFTP session…
            </p>
          ) : null}

          {!error && !connecting ? (
            <div className="mt-3 flex flex-col items-center rounded-xl border border-dashed border-graphite bg-obsidian/20 px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl border border-graphite bg-obsidian/60 text-fog">
                <FolderOpen size={22} />
              </span>
              <h3 className="m-0 mt-3 text-[14px] font-semibold text-mist">No SFTP connection</h3>
              <p className="m-0 mt-1 max-w-[340px] text-[12.5px] leading-relaxed text-fog">
                Choose a host and remote path above, or pick a recent connection below.
              </p>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fog/70">
              <History size={13} /> Recent SFTP
            </div>
            <div className="mt-2 grid gap-1.5">
              {recents.map((entry) => {
                const rec = hosts.find((h) => h.name === entry.host);
                const online = rec ? rec.status !== "offline" : true;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setDraftHostId(rec?.id ?? "");
                      setDraftPath(entry.path);
                      onConnectRecent(entry);
                    }}
                    className="group flex items-center gap-3 rounded-xl border border-graphite/70 bg-obsidian/30 px-3.5 py-2.5 text-left transition-colors hover:border-smoke hover:bg-obsidian/60"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-graphite text-mist">
                      <Server size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-mist">{entry.host}</span>
                        <span className={"h-1.5 w-1.5 rounded-full " + (online ? "bg-pulse-green" : "bg-fog/45")} />
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11.5px] text-fog">{entry.path}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fog/70">{entry.when}</span>
                    <ExternalLink size={14} className="shrink-0 text-fog/50 transition-colors group-hover:text-acid-lime" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Associations modal
// ---------------------------------------------------------------------------

function AssociationsModal({
  associations,
  onClose,
  onDelete,
}: {
  associations: Association[];
  onClose(): void;
  onDelete(extension: string): void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SFTP file type associations"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      data-testid="sftp-settings-modal"
    >
      <div className="grid w-full max-w-[520px] gap-4 rounded-lg border border-graphite bg-card p-6 shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <h2 className="m-0 text-body-lg font-w510 tracking-[-0.012em] text-paper">File associations</h2>
        <SftpSettings associations={associations} onDelete={(ext) => void onDelete(ext)} />
        <Button type="button" variant="outline" className="justify-self-start" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinCwd(cwd: string, name: string): string {
  if (cwd.endsWith("/")) return `${cwd}${name}`;
  return `${cwd}/${name}`;
}

function formatPermissions(mode: number, isDir: boolean): string {
  const r = (m: number, bit: number) => (m & bit ? "r" : "-");
  const w = (m: number, bit: number) => (m & bit ? "w" : "-");
  const x = (m: number, bit: number) => (m & bit ? "x" : "-");
  const type = isDir ? "d" : "-";
  return (
    type +
    r(mode, 0o400) + w(mode, 0o200) + x(mode, 0o100) +
    r(mode, 0o040) + w(mode, 0o020) + x(mode, 0o010) +
    r(mode, 0o004) + w(mode, 0o002) + x(mode, 0o001)
  );
}
