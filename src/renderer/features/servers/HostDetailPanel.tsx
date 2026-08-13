import { MoreHorizontal, Pencil, Power, Trash2, X } from "lucide-react";
import type { Group, Host } from "../../shared/types";
import { PortForwardList } from "../forwarding/PortForwardList";
import type { ForwardingApi } from "../forwarding/forwardingApi";
import { getHostCredential } from "../ssh/savedCredentials";
import type { CreateSshProfile } from "../ssh/sshTypes";
import { ProtocolBadge, StatusDot, Tag, groupColor, hostEndpoint } from "./serversAtoms";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function buildSshProfile(host: Host): CreateSshProfile | null {
  const saved = getHostCredential(host);
  if (!saved) return null;
  return {
    hostId: host.id,
    hostname: host.address,
    port: host.port ?? 22,
    username: host.username,
    authKind: saved.authKind,
    credentialRef: saved.credentialRef,
    identityId: null,
  };
}

function IconGhost({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Power;
  label: string;
  onClick?: () => void;
}) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-graphite/70 py-3 first:border-t-0 first:pt-0">
      <h4 className="m-0 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">{title}</h4>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 py-1">
      <dt className="text-[11.5px] uppercase tracking-wider text-fog/80">{label}</dt>
      <dd className={`m-0 truncate text-[12.5px] text-mist ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

export type HostDetailPanelProps = {
  host: Host;
  groups: Group[];
  snippets: { id: string; name: string; command: string }[];
  onConnect: (host: Host) => void;
  onClose: () => void;
  onEdit: (host: Host) => void;
  onDelete: (host: Host) => void;
  forwardingApi?: ForwardingApi;
};

export function HostDetailPanel({ host, groups, snippets, onConnect, onClose, onEdit, onDelete, forwardingApi }: HostDetailPanelProps) {
  const group = groups.find((g) => g.id === host.groupId);
  const startup = host.startupSnippets ?? [];
  const startupCommands = host.startupCommands ?? [];
  const env = host.env ?? {};
  const forwardingProfile = buildSshProfile(host);
  return (
    <aside className="relative flex h-full w-[360px] shrink-0 flex-col overflow-hidden border-l border-graphite bg-carbon">
      {group ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: groupColor(group.color) }}
        />
      ) : null}
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className="mt-1">
          <StatusDot status={host.status ?? "offline"} size={9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[15px] font-semibold tracking-tight text-paper">{host.name}</h2>
          <p className="m-0 mt-0.5 truncate font-mono text-[11.5px] text-fog">{hostEndpoint(host)}</p>
        </div>
        <IconGhost icon={Pencil} label="Edit" onClick={() => onEdit(host)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More"
              title="More"
              className="grid h-8 w-8 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onDelete(host)} className="text-coral-red focus:text-coral-red">
              <Trash2 size={14} />
              Delete host
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconGhost icon={X} label="Close" onClick={onClose} />
      </header>

      <div className="px-4">
        <button
          type="button"
          onClick={() => onConnect(host)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-acid-lime py-2 text-[13px] font-semibold tracking-tight text-void transition-colors hover:brightness-105"
        >
          <Power size={15} />
          Connect
        </button>
      </div>

      <div className="scroll-thin mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <Section title="Connection">
          <Field label="Protocol" value={<ProtocolBadge protocol={host.protocol} />} />
          <Field label="Address" value={host.address} mono />
          {host.port ? <Field label="Port" value={String(host.port)} mono /> : null}
          {host.protocol === "serial" && host.baudRate ? (
            <Field label="Baud rate" value={`${host.baudRate} 8N1`} mono />
          ) : null}
          <Field label="Username" value={host.username} mono />
          <Field
            label="Identity"
            value={
              host.authKind === "privateKey" || host.identity
                ? host.identity ?? "Private key"
                : "Password"
            }
            mono
          />
          <Field label="Group" value={group?.name ?? host.groupId} />
        </Section>

        <Section title="Routing">
          <Field label="Jump host" value={host.jumpHost} mono />
          <Field label="Proxy" value={host.proxy} mono />
        </Section>

        {(host.protocol ?? "ssh") === "ssh" && forwardingApi ? (
          <Section title="Port forwarding">
            {forwardingProfile ? (
              <PortForwardList
                hostId={host.id}
                profile={forwardingProfile}
                api={forwardingApi}
              />
            ) : (
              <p className="m-0 text-[12px] text-fog">
                Save an SSH credential for this host to enable port
                forwarding.
              </p>
            )}
          </Section>
        ) : null}

        {Object.keys(env).length > 0 ? (
          <Section title="Environment">
            {Object.entries(env).map(([k, v]) => (
              <Field key={k} label={k} value={v} mono />
            ))}
          </Section>
        ) : null}

        <Section title="Startup snippets">
          {startup.length > 0 || startupCommands.length > 0 ? (
            <div className="grid gap-1">
              {startup.map((sid) => {
                const snip = snippets.find((s) => s.id === sid);
                return (
                  <div key={sid} className="min-w-0 rounded-md border border-graphite/70 bg-obsidian/40 px-2.5 py-1.5">
                    <div className="text-[12px] text-mist">{snip?.name ?? sid}</div>
                    <div className="truncate font-mono text-[11px] text-fog" title={snip?.command}>
                      {snip?.command}
                    </div>
                  </div>
                );
              })}
              {startupCommands.map((command, index) => (
                <div
                  key={`${command}-${index}`}
                  className="min-w-0 rounded-md border border-graphite/70 bg-obsidian/40 px-2.5 py-1.5"
                >
                  <div className="text-[12px] text-mist">Custom command</div>
                  <div className="truncate font-mono text-[11px] text-fog" title={command}>
                    {command}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-fog">None</p>
          )}
        </Section>

        {host.tags.length > 0 ? (
          <Section title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {host.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}
