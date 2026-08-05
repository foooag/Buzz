import {
  ArrowDownAZ,
  ChevronRight,
  Filter,
  GripVertical,
  Grid2X2,
  List,
  Plus,
  Route,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Group, GroupColor, Host, InventoryErrorCode } from "../../shared/types";
import type { InventoryApi } from "./inventoryApi";
import type { ForwardingApi } from "../forwarding/forwardingApi";
import { useInventoryStore } from "./inventoryStore";
import { VaultSwitcher } from "./VaultSwitcher";
import type { SshApi } from "../ssh/sshApi";
import type { OpenedTerminal, TerminalEvent } from "../shell/terminalTypes";
import { HostDetailPanel } from "../servers/HostDetailPanel";
import {
  GroupFormPanel,
  HostFormPanel,
  type HostCredentialDraft,
  type HostDraft,
} from "../servers/HostFormPanel";
import { ProtocolBadge, StatusDot, Tag, groupColor, hostEndpoint } from "../servers/serversAtoms";
import {
  getHostCredential,
  getSavedCredential,
  setSavedCredential,
} from "../ssh/savedCredentials";
import {
  markConnectionConnected,
  markConnectionFailed,
  recordConnectionAttempt,
} from "../workspace/connectionHistory";
import {
  listCommandSnippets,
  subscribeCommandSnippets,
} from "../shell/commandSnippets";

type PanelState =
  | { type: "detail"; id: string }
  | { type: "edit-server"; id: string }
  | { type: "new-server" }
  | { type: "new-group" };

function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-graphite bg-obsidian/60 text-fog">
        <Search size={22} />
      </span>
      <h3 className="m-0 mt-3 text-[14px] font-semibold text-mist">{title}</h3>
      {body ? <p className="m-0 mt-1 max-w-[320px] text-[12.5px] leading-relaxed text-fog">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function InventoryView({ api, query = "", sshApi, forwardingApi, onSshEvent, onSshOpened, onQuickConnect, sshKeepaliveInterval = 30, onSshStartup }: {
  api: InventoryApi;
  query?: string;
  sshApi?: SshApi;
  forwardingApi?: ForwardingApi;
  onSshEvent?: (event: TerminalEvent) => void;
  onSshOpened?: (opened: OpenedTerminal) => void;
  onQuickConnect?: () => void;
  sshKeepaliveInterval?: number;
  onSshStartup?: (sessionId: string, commands: string[]) => Promise<void>;
}) {
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [tag, setTag] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"manual" | "nameAsc" | "nameDesc">("manual");
  const [deletingHost, setDeletingHost] = useState<Host | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [snippets, setSnippets] = useState(listCommandSnippets);

  const status = useInventoryStore((state) => state.status);
  const errorCode = useInventoryStore((state) => state.errorCode);
  const vaultOrder = useInventoryStore((state) => state.vaultOrder);
  const activeVaultId = useInventoryStore((state) => state.activeVaultId);
  const hostMap = useInventoryStore((state) => state.hosts);
  const groupMap = useInventoryStore((state) => state.groups);
  const identityMap = useInventoryStore((state) => state.identities);
  const hosts = useMemo(() => Object.values(hostMap), [hostMap]);
  const groups = useMemo(() => Object.values(groupMap), [groupMap]);
  const identities = useMemo(() => Object.values(identityMap), [identityMap]);

  const loadVaults = useCallback(async () => {
    const store = useInventoryStore.getState();
    store.beginLoad();
    try {
      store.setVaults(await api.listVaults());
    } catch (error) {
      store.fail(errorCodeOf(error));
    }
  }, [api]);

  const loadResources = useCallback(async () => {
    const id = useInventoryStore.getState().activeVaultId;
    if (!id) {
      useInventoryStore.getState().setResources([], [], []);
      return;
    }
    try {
      const [loadedGroups, loadedHosts, loadedIdentities] = await Promise.all([
        api.listGroups(id),
        api.listHosts(id),
        api.listIdentities(id),
      ]);
      const migratedHosts = await Promise.all(loadedHosts.map(async (host) => {
        if (host.credentialRef) return host;
        const legacyCredential = getSavedCredential(host.id);
        if (!legacyCredential) return host;
        try {
          const updated = await api.updateHost({
            ...host,
            authKind: legacyCredential.authKind,
            credentialRef: legacyCredential.credentialRef,
          });
          setSavedCredential(host.id, null);
          return updated ?? {
            ...host,
            authKind: legacyCredential.authKind,
            credentialRef: legacyCredential.credentialRef,
          };
        } catch {
          return host;
        }
      }));
      useInventoryStore.getState().setResources(loadedGroups, migratedHosts, loadedIdentities);
    } catch (error) {
      useInventoryStore.getState().fail(errorCodeOf(error));
    }
  }, [api]);

  useEffect(() => {
    void loadVaults();
  }, [loadVaults]);
  useEffect(() => {
    if (status === "ready") void loadResources();
  }, [activeVaultId, loadResources, status, vaultOrder.length]);
  useEffect(
    () => subscribeCommandSnippets(() => setSnippets(listCommandSnippets())),
    [],
  );

  const allTags = useMemo(
    () => Array.from(new Set(hosts.flatMap((h) => h.tags))).sort(),
    [hosts],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = hosts.filter((h) => {
      if (tag && !h.tags.includes(tag)) return false;
      if (!q) return true;
      return (
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        (h.username ?? "").toLowerCase().includes(q) ||
        h.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    if (sort === "manual") return matches;
    return [...matches].sort((left, right) => {
      const order = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      return sort === "nameAsc" ? order : -order;
    });
  }, [hosts, query, sort, tag]);

  const selectedHost =
    panel && (panel.type === "detail" || panel.type === "edit-server")
      ? hostMap[panel.id] ?? null
      : null;
  const selectedId =
    panel && (panel.type === "detail" || panel.type === "edit-server") ? panel.id : null;

  const handleSaveHost = useCallback(
    async (draft: HostDraft, credential: HostCredentialDraft, id?: string) => {
      const existingCredential = id && hostMap[id]
        ? getHostCredential(hostMap[id])
        : null;
      const credentialValue =
        credential.authKind === "password" ? credential.password : credential.privateKey;
      let credentialRef = credential.saveCredential &&
        existingCredential?.authKind === credential.authKind
        ? existingCredential.credentialRef
        : null;
      if (credential.saveCredential && credentialValue && sshApi) {
        credentialRef = await sshApi.storeCredential(
          credential.authKind === "password"
            ? { type: "password", password: credential.password }
            : {
                type: "privateKey",
                privateKey: Array.from(new TextEncoder().encode(credential.privateKey)),
                passphrase: credential.passphrase || null,
              },
        );
      }
      const input = {
        ...draft,
        authKind: credential.authKind,
        credentialRef,
      };
      if (id) {
        await api.updateHost({ ...input, id });
        setPanel({ type: "detail", id });
      } else {
        const created = await api.createHost(input);
        setPanel({ type: "detail", id: created.id });
      }
      if (id) setSavedCredential(id, null);
      setConnectionError(null);
      await loadResources();
    },
    [api, hostMap, loadResources, sshApi],
  );

  const handleSaveGroup = useCallback(
    async (input: { name: string; color: string }) => {
      if (!activeVaultId) return;
      await api.createGroup({ vaultId: activeVaultId, parentId: null, name: input.name, color: input.color as GroupColor });
      setPanel(null);
      await loadResources();
    },
    [activeVaultId, api, loadResources],
  );

  const connectHost = (host: Host) => {
    if (sshApi && onSshEvent && onSshOpened) {
      setConnectionError(null);
      const savedCredential = getHostCredential(host);
      if (savedCredential) {
        const historyId = recordConnectionAttempt({
          hostId: host.id,
          host: host.address,
          port: host.port ?? 22,
          username: host.username,
        });
        void sshApi.open({
          hostId: host.id,
          hostname: host.address,
          port: host.port ?? 22,
          username: host.username,
          authKind: savedCredential.authKind,
          credentialRef: savedCredential.credentialRef,
          identityId: null,
          keepaliveInterval: sshKeepaliveInterval,
        }, { cols: 80, rows: 24 }, onSshEvent)
          .then(async (opened) => {
            markConnectionConnected(historyId, opened.sessionId);
            try {
              await onSshStartup?.(opened.sessionId, startupCommandsForHost(host, snippets));
            } catch {
              // A startup command failure must not hide an already-open SSH session.
            }
            onSshOpened(opened);
          })
          .catch(async (error: unknown) => {
            markConnectionFailed(historyId);
            if (
              typeof error === "object" &&
              error &&
              "code" in error &&
              error.code === "SSH_CREDENTIAL_UNAVAILABLE"
            ) {
              await api.updateHost({ ...host, credentialRef: null }).catch(() => undefined);
              await loadResources();
              setPanel({ type: "edit-server", id: host.id });
              setConnectionError("The saved credential is unavailable. Update it in the server form to reconnect.");
              return;
            }
            setConnectionError("The SSH connection could not be opened.");
          });
        return;
      }
      setConnectionError("Save a password or private key in the server form before connecting.");
      setPanel({ type: "edit-server", id: host.id });
    } else {
      onQuickConnect?.();
    }
  };

  const renderRightPanel = () => {
    if (panel?.type === "new-server" && activeVaultId) {
      return (
        <HostFormPanel
          groups={groups}
          identities={identities}
          hosts={hosts}
          snippets={snippets}
          onSave={(draft, password) => void handleSaveHost({ ...draft, vaultId: activeVaultId }, password)}
          onCancel={() => setPanel(null)}
        />
      );
    }
    if (panel?.type === "new-group") {
      return <GroupFormPanel onSave={(input) => void handleSaveGroup(input)} onCancel={() => setPanel(null)} />;
    }
    if (panel?.type === "edit-server" && selectedHost) {
      const savedCredential = getHostCredential(selectedHost);
      return (
        <HostFormPanel
          groups={groups}
          identities={identities}
          hosts={hosts}
          snippets={snippets}
          initial={selectedHost}
          savedAuthKind={savedCredential?.authKind}
          onSave={(draft, password) => void handleSaveHost(draft, password, selectedHost.id)}
          onCancel={() => setPanel({ type: "detail", id: selectedHost.id })}
        />
      );
    }
    if (selectedHost) {
      return (
        <HostDetailPanel
          host={selectedHost}
          groups={groups}
          snippets={snippets}
          onConnect={connectHost}
          onClose={() => setPanel(null)}
          onEdit={(host) => setPanel({ type: "edit-server", id: host.id })}
          onDelete={(host) => setDeletingHost(host)}
          forwardingApi={forwardingApi}
        />
      );
    }
    return null;
  };

  if (status === "loading" || status === "idle") {
    return <div className="grid gap-2 p-5 text-fog">Loading vaults…</div>;
  }
  if (status === "error") {
    return (
      <div className="grid gap-3 p-5">
        <Alert variant="destructive">
          <AlertTitle className="text-body-lg font-w510">
            {errorCode === "VAULT_KEY_UNAVAILABLE" ? "Local encryption key unavailable" : "Inventory unavailable"}
          </AlertTitle>
          <AlertDescription>
            {errorCode === "VAULT_KEY_UNAVAILABLE" ? "Restore the app data encryption key or reset local data." : "The local inventory could not be opened."}
          </AlertDescription>
        </Alert>
        <Button type="button" aria-label="Retry vault" variant="outline" className="justify-self-start" onClick={() => void loadVaults()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!vaultOrder.length) {
    return (
      <div className="grid gap-3 p-5">
        <Alert>
          <AlertTitle className="text-body-lg font-w510">No vaults yet</AlertTitle>
          <AlertDescription>Create a local vault to organize encrypted hosts.</AlertDescription>
        </Alert>
        <VaultSwitcher api={api} />
      </div>
    );
  }

  const renderList = () => {
    if (filtered.length === 0) {
      return (
        <EmptyState
          title="No servers match"
          body="Try a different search term, clear the tag filter, or add a new server."
          action={
            <Button type="button" onClick={() => setPanel({ type: "new-server" })}>
              <Plus size={14} /> New Server
            </Button>
          }
        />
      );
    }
    if (layout === "grid") {
      return (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {filtered.map((host) => {
            const selected = panel?.type !== "new-group" && selectedId === host.id;
            return (
              <article
                key={host.id}
                role="button"
                tabIndex={0}
                aria-label={`Select ${host.name}`}
                data-active={selected || undefined}
                onClick={() => setPanel({ type: "detail", id: host.id })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPanel({ type: "detail", id: host.id });
                  }
                }}
                className={
                  "group card relative cursor-pointer rounded-xl border bg-obsidian/40 p-3.5 transition-colors " +
                  (selected ? "border-acid-lime/60 bg-graphite/60" : "border-graphite hover:border-smoke hover:bg-graphite/40")
                }
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 shrink-0">
                    <StatusDot status={host.status ?? "offline"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 truncate text-[14px] font-semibold tracking-tight text-paper">{host.name}</h2>
                    <p className="m-0 mt-0.5 truncate font-mono text-[11.5px] text-fog">{hostEndpoint(host)}</p>
                  </div>
                  <span className="text-fog opacity-0 transition-opacity group-hover:opacity-60">
                    <GripVertical size={14} />
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <ProtocolBadge protocol={host.protocol} />
                  {host.jumpHost ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-fog" title={`Jump host: ${host.jumpHost}`}>
                      <Route size={11} />
                      {host.jumpHost}
                    </span>
                  ) : null}
                </div>
                {host.tags.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {host.tags.slice(0, 3).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2.5 flex items-center justify-between border-t border-graphite/60 pt-2 text-[11px] text-fog/80">
                  <span className="truncate">{host.label ?? host.notes ?? "Remote host"}</span>
                  <span className="shrink-0">{host.lastConnected ?? "never"}</span>
                </div>
              </article>
            );
          })}
        </div>
      );
    }
    return (
      <div className="grid gap-1.5">
        {filtered.map((host) => {
          const selected = panel?.type !== "new-group" && selectedId === host.id;
          return (
            <button
              key={host.id}
              type="button"
              onClick={() => setPanel({ type: "detail", id: host.id })}
              aria-label={`Select ${host.name}`}
              className={
                "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors " +
                (selected ? "border-acid-lime/60 bg-graphite/60" : "border-graphite/60 hover:bg-white/5")
              }
            >
              <StatusDot status={host.status ?? "offline"} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-mist">{host.name}</div>
                <div className="truncate font-mono text-[11.5px] text-fog">{hostEndpoint(host)}</div>
              </div>
              <ProtocolBadge protocol={host.protocol} />
              <ChevronRight size={14} className="text-fog/60" />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <VaultSwitcher api={api} />
            <button
              type="button"
              aria-label="New Server"
              onClick={() => setPanel({ type: "new-server" })}
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-mist transition-colors hover:bg-white/5"
            >
              <Plus size={14} />
              New Server
            </button>
            <button
              type="button"
              aria-label="New Group"
              onClick={() => setPanel({ type: "new-group" })}
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <Plus size={14} />
              New Group
            </button>
            <button
              type="button"
              aria-label="Import"
              disabled
              title="Available in the Import milestone"
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-fog opacity-60"
            >
              <Upload size={14} />
              Import
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog">
              <Filter size={13} />
              <span className="text-fog/70">Tag</span>
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                aria-label="Filter by tag"
                className="bg-transparent text-mist outline-none"
              >
                <option value="">All</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label="Sort servers"
              aria-pressed={sort !== "manual"}
              title={sort === "nameAsc" ? "Name A–Z" : sort === "nameDesc" ? "Name Z–A" : "Original order"}
              onClick={() => setSort((current) => current === "manual" ? "nameAsc" : current === "nameAsc" ? "nameDesc" : "manual")}
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog hover:bg-white/5 hover:text-mist"
            >
              <ArrowDownAZ size={13} />
              {sort === "nameAsc" ? "A–Z" : sort === "nameDesc" ? "Z–A" : "Sort"}
            </button>
            <div className="flex items-center rounded-md border border-graphite p-0.5">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={layout === "grid"}
                onClick={() => setLayout("grid")}
                className={
                  "grid h-7 w-7 place-items-center rounded " +
                  (layout === "grid" ? "bg-graphite text-mist" : "text-fog hover:text-mist")
                }
              >
                <Grid2X2 size={15} />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
                className={
                  "grid h-7 w-7 place-items-center rounded " +
                  (layout === "list" ? "bg-graphite text-mist" : "text-fog hover:text-mist")
                }
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Group rail */}
        {connectionError ? (
          <div className="px-5 pb-2">
            <Alert variant="destructive">
              <AlertDescription>{connectionError}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto px-5 pb-2">
          <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-fog/60">Groups</span>
          {groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-graphite px-2.5 py-1 text-[12px] text-fog"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: groupColor(g.color) }} />
              {g.name}
              <span className="text-fog/60">{hosts.filter((h) => h.groupId === g.id).length}</span>
            </span>
          ))}
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">{renderList()}</div>
      </div>

      {renderRightPanel()}

      {deletingHost ? (
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete host</DialogTitle>
              <DialogDescription>This removes {deletingHost.name} from the local vault.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="destructive"
                onClick={async () => {
                  await api.deleteHost(deletingHost.id);
                  setDeletingHost(null);
                  setPanel(null);
                  await loadResources();
                }}
              >
                Confirm delete
              </Button>
              <Button variant="outline" onClick={() => setDeletingHost(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function startupCommandsForHost(
  host: Host,
  snippets: Array<{ id: string; command: string }>,
): string[] {
  const selected = new Set(host.startupSnippets ?? []);
  return [
    ...Object.entries(host.env ?? {}).map(
      ([name, value]) => `export ${name}=${quoteShellValue(value)}`,
    ),
    ...snippets.filter((snippet) => selected.has(snippet.id)).map((snippet) => snippet.command),
    ...(host.startupCommands ?? []),
  ].filter((command) => command.trim().length > 0);
}

function quoteShellValue(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function errorCodeOf(error: unknown): InventoryErrorCode {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string")
    return error.code as InventoryErrorCode;
  return "INVENTORY_STORAGE_FAILED";
}
