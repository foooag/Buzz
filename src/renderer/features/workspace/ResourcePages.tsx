import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  History,
  Link2,
  Network,
  Pencil,
  Plus,
  RotateCw,
  Route,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadConnectionHistory,
  formatHistoryDuration,
  formatHistoryWhen,
  listConnectionHistory,
  subscribeConnectionHistory,
  type HistoryEntry,
  type HistoryStatus,
} from "./connectionHistory";
import { ProtocolBadge, StatusDot } from "../servers/serversAtoms";
import type { HostStatus } from "../../shared/types";
import { useInventoryStore } from "../inventory/inventoryStore";
import { getHostCredential } from "../ssh/savedCredentials";
import type { HostKeyPrompt } from "../ssh/sshTypes";
import {
  useForwardingStore,
  type ForwardingStore,
} from "../forwarding/forwardingStore";
import type {
  ForwardKind,
  PortForwardRule,
  PortForwardRuleInput,
} from "../forwarding/forwardingTypes";

function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: typeof Network;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-mist">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <h1 className="m-0 text-[16px] font-semibold tracking-tight text-paper">{title}</h1>
          {subtitle ? <p className="m-0 mt-0.5 text-[12px] text-fog">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

function IconGhost({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
    >
      <Icon size={16} />
    </button>
  );
}

function Switch({ on, onChange, ariaLabel }: { on: boolean; onChange: (value: boolean) => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      className={`relative h-[20px] w-[34px] rounded-full transition-colors ${on ? "bg-acid-lime/80" : "bg-smoke"}`}
    >
      <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-paper transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
    </button>
  );
}

const KIND_STYLE: Record<ForwardKind, { label: string; cls: string }> = {
  local: { label: "Local", cls: "bg-signal-teal/12 text-signal-teal" },
  remote: { label: "Remote", cls: "bg-lavender/12 text-lavender" },
  dynamic: { label: "SOCKS", cls: "bg-acid-lime/12 text-acid-lime" },
};

function describeTarget(rule: PortForwardRule): string {
  if (rule.kind === "dynamic") return "any (dynamic)";
  return `${rule.targetHost ?? ""}:${rule.targetPort ?? ""}`;
}

function ruleDisplayName(rule: PortForwardRule): string {
  return rule.label ?? `${rule.bindHost}:${rule.bindPort}`;
}

function ForwardRow({ rule, running, hostName, onToggle, onEdit, onDelete }: {
  rule: PortForwardRule;
  running: boolean;
  hostName: string;
  onToggle: (rule: PortForwardRule, value: boolean) => void;
  onEdit: (rule: PortForwardRule) => void;
  onDelete: (rule: PortForwardRule) => void;
}) {
  const style = KIND_STYLE[rule.kind];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-graphite/70 bg-obsidian/30 px-3.5 py-3">
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${style.cls}`}>
        <Route size={11} />
        {style.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-mist">{ruleDisplayName(rule)}</span>
          <span className="rounded-pill bg-graphite/60 px-2 py-0.5 text-[11px] text-fog">via {hostName}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11.5px] text-fog">
          <Link2 size={11} />
          <span>{rule.bindHost}:{rule.bindPort}</span>
          <span className="text-fog/50">→</span>
          <span>{describeTarget(rule)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${running ? "text-pulse-green" : "text-fog/70"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-pulse-green" : "bg-fog/40"}`} />
          {running ? "Forwarding" : "Stopped"}
        </span>
        <Switch on={running} ariaLabel={`Toggle ${ruleDisplayName(rule)}`} onChange={(value) => onToggle(rule, value)} />
        <IconGhost icon={Pencil} label={`Edit ${ruleDisplayName(rule)}`} onClick={() => onEdit(rule)} />
        <IconGhost icon={Trash2} label={`Delete ${ruleDisplayName(rule)}`} onClick={() => onDelete(rule)} />
      </div>
    </div>
  );
}

export function PortForwardingPage({
  store = useForwardingStore,
  keepaliveInterval = 30,
}: {
  store?: ForwardingStore;
  keepaliveInterval?: number;
} = {}) {
  const hostMap = useInventoryStore((state) => state.hosts);
  const rulesByHostId = store((state) => state.rulesByHostId);
  const activeIds = store((state) => state.activeIds);
  const hostIds = useMemo(
    () => Object.values(hostMap).filter((host) => !host.protocol || host.protocol === "ssh").map((host) => host.id),
    [hostMap],
  );
  const [editing, setEditing] = useState<PortForwardRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<PortForwardRule | null>(null);
  const [pendingHostKey, setPendingHostKey] = useState<HostKeyPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hostIds.length > 0) void store.getState().loadAllRules(hostIds);
    void store.getState().refreshActive();
  }, [hostIds, store]);

  const rules = useMemo(
    () => hostIds.flatMap((id) => rulesByHostId[id] ?? []),
    [hostIds, rulesByHostId],
  );

  const toggleRule = async (rule: PortForwardRule, running: boolean) => {
    setError(null);
    if (!running) {
      await store.getState().stopRule(rule.id);
      return;
    }
    const host = hostMap[rule.hostId];
    const credential = host ? getHostCredential(host) : null;
    if (!host || !credential) {
      setError("Choose a saved SSH host with a stored password or private key.");
      return;
    }
    try {
      await store.getState().startRule(
        {
          hostId: host.id,
          hostname: host.address,
          port: host.port ?? 22,
          username: host.username,
          authKind: credential.authKind,
          credentialRef: credential.credentialRef,
          identityId: null,
          keepaliveInterval,
        },
        rule,
        (event) => {
          if (event.type === "hostKeyVerificationRequired") setPendingHostKey(event);
        },
      );
    } catch {
      setError("The port forwarding rule could not be started.");
    }
  };

  const runningCount = rules.filter((rule) => activeIds.has(rule.id)).length;
  return (
    <section className="flex min-h-screen flex-col bg-void">
      <PageHeader
        icon={Network}
        title="Port Forwarding"
        subtitle={`${runningCount} of ${rules.length} rules forwarding · local, remote & dynamic SOCKS`}
        actions={
          <Button type="button" size="sm" onClick={() => setEditing("new")}>
            <Plus size={15} /> New rule
          </Button>
        }
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {error ? (
          <div role="alert" className="mb-3 rounded-lg border border-coral-red/30 bg-coral-red/6 px-3 py-2 text-[12px] text-coral-red">
            {error}
          </div>
        ) : null}
        <div className="grid gap-2">
          {rules.map((rule) => (
            <ForwardRow
              key={rule.id}
              rule={rule}
              running={activeIds.has(rule.id)}
              hostName={hostMap[rule.hostId]?.name ?? "Missing host"}
              onToggle={(target, value) => void toggleRule(target, value)}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </div>
      </div>
      {editing ? (
        <ForwardRuleDialog
          hosts={hostIds.map((id) => ({ id, name: hostMap[id]?.name ?? id, address: hostMap[id]?.address ?? "" }))}
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            void (async () => {
              if (editing !== "new") {
                if (activeIds.has(editing.id)) await store.getState().stopRule(editing.id);
                await store.getState().updateRule({ ...editing, ...input, id: editing.id });
              } else {
                await store.getState().createRule(input);
              }
              setEditing(null);
            })();
          }}
        />
      ) : null}
      {deleting ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-void/70 p-4">
          <div role="alertdialog" aria-label="Delete port forwarding rule" className="w-full max-w-[420px] rounded-xl border border-graphite bg-carbon p-5">
            <h2 className="m-0 text-[16px] font-semibold text-paper">Delete port forwarding rule?</h2>
            <p className="text-[13px] text-fog">{ruleDisplayName(deleting)}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button onClick={() => {
                void (async () => {
                  if (activeIds.has(deleting.id)) await store.getState().stopRule(deleting.id);
                  await store.getState().deleteRule(deleting.id, deleting.hostId);
                  setDeleting(null);
                })();
              }}>
                Confirm delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingHostKey ? (
        <div className="fixed inset-0 z-60 grid place-items-center bg-void/75 p-4">
          <div role="dialog" aria-label="Verify forwarding host key" className="w-full max-w-[460px] rounded-xl border border-graphite bg-carbon p-5">
            <h2 className="m-0 text-[16px] font-semibold text-paper">Verify SSH host key</h2>
            <p className="mt-2 text-[12px] text-fog">{pendingHostKey.host}:{pendingHostKey.port}</p>
            <code className="block break-all rounded-md bg-obsidian p-2 text-[11px] text-mist">{pendingHostKey.fingerprint}</code>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                void store.getState().decideHostKey(pendingHostKey.sessionId, false);
                setPendingHostKey(null);
              }}>Reject</Button>
              <Button onClick={() => {
                void store.getState().decideHostKey(pendingHostKey.sessionId, true);
                setPendingHostKey(null);
              }}>Trust and start</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ForwardRuleDialog({
  initial,
  hosts,
  onClose,
  onSave,
}: {
  initial?: PortForwardRule;
  hosts: Array<{ id: string; name: string; address: string }>;
  onClose: () => void;
  onSave: (rule: PortForwardRuleInput) => void;
}) {
  const [rule, setRule] = useState<PortForwardRuleInput>(initial ?? {
    kind: "local",
    bindHost: "127.0.0.1",
    bindPort: 8080,
    targetHost: "localhost",
    targetPort: 80,
    hostId: "",
    label: "",
  });
  const field = "rounded-md border border-graphite bg-obsidian px-2.5 py-2 text-[13px] text-mist outline-hidden";
  const valid = Boolean(
    hosts.some((host) => host.id === rule.hostId) &&
    rule.bindHost.trim() &&
    rule.bindPort > 0 &&
    (rule.kind === "dynamic" || (rule.targetHost?.trim() && rule.targetPort)),
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-void/70 p-4" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-label={initial ? "Edit port forwarding rule" : "New port forwarding rule"}
        className="grid w-full max-w-[520px] gap-3 rounded-xl border border-graphite bg-carbon p-5"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSave({ ...rule, label: rule.label?.trim() || null });
        }}
      >
        <h2 className="m-0 text-[16px] font-semibold text-paper">{initial ? "Edit rule" : "New rule"}</h2>
        <label className="grid gap-1 text-[12px] text-fog">Label <span className="text-fog/50">(optional)</span>
          <input className={field} value={rule.label ?? ""} onChange={(event) => setRule({ ...rule, label: event.target.value })} placeholder="e.g. staging database" />
        </label>
        <label className="grid gap-1 text-[12px] text-fog">Type
          <select className={field} value={rule.kind} onChange={(event) => setRule({ ...rule, kind: event.target.value as ForwardKind })}>
            <option value="local">Local</option><option value="remote">Remote</option><option value="dynamic">SOCKS</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] text-fog">SSH host
          <select className={field} value={rule.hostId} onChange={(event) => setRule({ ...rule, hostId: event.target.value })}>
            <option value="">Choose a saved host…</option>
            {hosts.map((host) => <option key={host.id} value={host.id}>{host.name} · {host.address}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-[12px] text-fog">Bind address
            <input className={field} value={rule.bindHost} onChange={(event) => setRule({ ...rule, bindHost: event.target.value })} />
          </label>
          <label className="grid gap-1 text-[12px] text-fog">Bind port
            <input type="number" className={field} value={rule.bindPort} onChange={(event) => setRule({ ...rule, bindPort: Number(event.target.value) })} />
          </label>
        </div>
        {rule.kind !== "dynamic" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-[12px] text-fog">Target host
              <input className={field} value={rule.targetHost ?? ""} onChange={(event) => setRule({ ...rule, targetHost: event.target.value })} />
            </label>
            <label className="grid gap-1 text-[12px] text-fog">Target port
              <input type="number" className={field} value={rule.targetPort ?? ""} onChange={(event) => setRule({ ...rule, targetPort: Number(event.target.value) || null })} />
            </label>
          </div>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!valid}>{initial ? "Save changes" : "Create rule"}</Button>
        </div>
      </form>
    </div>
  );
}

const HISTORY_STATUS_DOT: Record<HistoryStatus, HostStatus> = {
  connected: "online",
  success: "online",
  failed: "failed",
};
const HISTORY_STATUS_STYLE: Record<HistoryStatus, { cls: string; label: string }> = {
  success: { cls: "bg-pulse-green/12 text-pulse-green", label: "Success" },
  connected: { cls: "bg-acid-lime/12 text-acid-lime", label: "Active" },
  failed: { cls: "bg-coral-red/12 text-coral-red", label: "Failed" },
};

function HistoryRow({ entry, onReconnect }: { entry: HistoryEntry; onReconnect: (entry: HistoryEntry) => void }) {
  const failed = entry.status === "failed";
  const statusStyle = HISTORY_STATUS_STYLE[entry.status];
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${failed ? "border-coral-red/30 bg-coral-red/4" : "border-graphite/70 bg-obsidian/30"}`}>
      <StatusDot status={HISTORY_STATUS_DOT[entry.status]} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-mist">{entry.username}@{entry.host}</span>
          <ProtocolBadge protocol={entry.protocol} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-fog">
          <span>{formatHistoryWhen(entry)}</span>
          <span className="text-fog/40">·</span>
          <span>{formatHistoryDuration(entry)}</span>
          {failed ? (
            <>
              <span className="text-fog/40">·</span>
              <span className="inline-flex items-center gap-1 text-coral-red/90">
                <CircleAlert size={11} />
                {entry.reason}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <span className={`hidden items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${statusStyle.cls}`}>
        {failed ? <X size={11} /> : <Check size={11} />}
        {statusStyle.label}
      </span>
      <button
        type="button"
        onClick={() => onReconnect(entry)}
        className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:bg-white/5"
      >
        <RotateCw size={13} />
        {failed ? "Retry" : "Reconnect"}
      </button>
    </div>
  );
}

export function HistoryPage({ onReconnect }: { onReconnect?: (entry: HistoryEntry) => void } = {}) {
  const [query, setQuery] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [history, setHistory] = useState(listConnectionHistory);
  useEffect(
    () => subscribeConnectionHistory(() => setHistory(listConnectionHistory())),
    [],
  );
  const filtered = history.filter((entry) => {
    if (onlyFailed && entry.status !== "failed") return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return entry.host.toLowerCase().includes(q) || entry.username.toLowerCase().includes(q);
  });
  return (
    <section className="flex min-h-screen flex-col bg-void">
      <PageHeader
        icon={History}
        title="History"
        subtitle={`${history.length} real connections across all hosts`}
        actions={
          <>
            <label className="inline-flex items-center gap-2 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog">
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search history"
                aria-label="Search history"
                className="w-[150px] bg-transparent text-mist outline-hidden placeholder:text-fog/60"
              />
            </label>
            <Button type="button" variant="outline" size="sm" disabled={!history.length} onClick={() => downloadConnectionHistory(history)}>
              <ArrowDownToLine size={15} /> Export
            </Button>
          </>
        }
      />
      <div className="flex items-center gap-2 px-5 pb-2 text-[12px]">
        <button
          type="button"
          onClick={() => setOnlyFailed(false)}
          className={`rounded-pill px-2.5 py-1 transition-colors ${!onlyFailed ? "bg-graphite text-mist" : "text-fog hover:text-mist"}`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setOnlyFailed(true)}
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 transition-colors ${onlyFailed ? "bg-coral-red/15 text-coral-red" : "text-fog hover:text-mist"}`}
        >
          <CircleAlert size={12} />
          Failed only
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-graphite bg-obsidian/60 text-fog">
              <Search size={22} />
            </span>
            <h3 className="m-0 mt-3 text-[14px] font-semibold text-mist">No matching history</h3>
            <p className="m-0 mt-1 max-w-[320px] text-[12.5px] leading-relaxed text-fog">Adjust your search or clear the failed-only filter.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} onReconnect={(target) => onReconnect?.(target)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
