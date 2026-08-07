import { ExternalLink, Search, X } from "lucide-react";
import { useState } from "react";
import { InventoryView } from "../inventory/InventoryView";
import type { InventoryApi } from "../inventory/inventoryApi";
import { useInventoryStore } from "../inventory/inventoryStore";
import type { ForwardingApi } from "../forwarding/forwardingApi";
import type { SshApi } from "../ssh/sshApi";
import type { OpenedTerminal, TerminalEvent } from "../shell/terminalTypes";
import { SshConnectForm, type SaveAsServerInput } from "../ssh/SshConnectForm";

export type QuickSshTarget = {
  hostname: string;
  port: number;
  username: string;
};

export function parseQuickSshTarget(value: string): QuickSshTarget | null {
  const tokens = value.trim().split(/\s+/);
  if (tokens.shift()?.toLowerCase() !== "ssh") return null;
  let port = 22;
  const destinations: string[] = [];
  while (tokens.length) {
    const token = tokens.shift()!;
    if (token === "-p") {
      const next = Number(tokens.shift());
      if (!Number.isInteger(next) || next < 1 || next > 65535) return null;
      port = next;
    } else if (/^-p\d+$/.test(token)) {
      port = Number(token.slice(2));
      if (port < 1 || port > 65535) return null;
    } else if (token.startsWith("-")) {
      return null;
    } else {
      destinations.push(token);
    }
  }
  if (destinations.length !== 1) return null;
  const destination = destinations[0]!;
  const separator = destination.lastIndexOf("@");
  const username = separator >= 0 ? destination.slice(0, separator) : "";
  const hostname = separator >= 0 ? destination.slice(separator + 1) : destination;
  if (!hostname || (separator >= 0 && !username)) return null;
  return { hostname, port, username };
}

export function ServersPage({ inventoryApi, sshApi, forwardingApi, onSshEvent, onSshOpened, sshKeepaliveInterval, onSshStartup }: {
  inventoryApi: InventoryApi;
  sshApi?: SshApi;
  forwardingApi?: ForwardingApi;
  onSshEvent?: (event: TerminalEvent) => void;
  onSshOpened?: (opened: OpenedTerminal) => void;
  sshKeepaliveInterval?: number;
  onSshStartup?: (sessionId: string, commands: string[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [quickTarget, setQuickTarget] = useState<QuickSshTarget | null>(null);
  const parsedTarget = parseQuickSshTarget(query);
  const canConnect = Boolean(parsedTarget && sshApi && onSshEvent && onSshOpened);
  const openQuickConnect = () => {
    if (parsedTarget && canConnect) setQuickTarget(parsedTarget);
  };
  const handleSaveAsServer = async (input: SaveAsServerInput) => {
    const vaultId = useInventoryStore.getState().activeVaultId;
    if (!vaultId) return;
    const created = await inventoryApi.createHost({
      vaultId,
      groupId: null,
      name: input.hostname,
      address: input.hostname,
      username: input.username,
      tags: [],
      notes: "",
      protocol: "ssh",
      port: input.port,
      authKind: input.authKind,
      credentialRef: input.credentialRef,
      status: "offline",
      label: "",
      lastConnected: "never",
    });
    useInventoryStore.getState().upsertHost(created);
    setQuickTarget(null);
    setQuery("");
  };
  return (
    <section aria-labelledby="servers-heading" className="flex h-full min-h-0 flex-col overflow-hidden bg-void">
      <h1 id="servers-heading" className="sr-only">Servers</h1>
      <div className="px-5 pt-4">
        <div className="flex items-center gap-2 rounded-xl border border-graphite bg-obsidian/50 px-3 py-2 transition-colors focus-within:border-smoke">
          <Search size={16} className="shrink-0 text-fog" />
          <label className="sr-only" htmlFor="quick-connect-input">
            Find a host or enter an SSH command
          </label>
          <input
            id="quick-connect-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canConnect) openQuickConnect();
            }}
            placeholder={'Search servers or connect directly — try “ssh deploy@10.0.0.20”'}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-mist outline-none placeholder:text-fog/60"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="grid h-7 w-7 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={openQuickConnect}
            disabled={!canConnect}
            aria-label="Connect"
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " +
              (canConnect ? "bg-acid-lime text-void hover:brightness-105" : "bg-graphite text-fog")
            }
          >
            <ExternalLink size={14} />
            Connect
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {quickTarget && sshApi && onSshEvent && onSshOpened ? (
          <SshConnectForm
            api={sshApi}
            hostId={`quick:${quickTarget.hostname}:${quickTarget.port}`}
            defaultHostname={quickTarget.hostname}
            defaultPort={quickTarget.port}
            defaultUsername={quickTarget.username}
            keepaliveInterval={sshKeepaliveInterval}
            onCancel={() => setQuickTarget(null)}
            onEvent={onSshEvent}
            onOpened={onSshOpened}
            onSaveAsServer={handleSaveAsServer}
          />
        ) : (
          <InventoryView
            api={inventoryApi}
            query={query}
            sshApi={sshApi}
            forwardingApi={forwardingApi}
            onSshEvent={onSshEvent}
            onSshOpened={onSshOpened}
            sshKeepaliveInterval={sshKeepaliveInterval}
            onSshStartup={onSshStartup}
          />
        )}
      </div>
    </section>
  );
}
