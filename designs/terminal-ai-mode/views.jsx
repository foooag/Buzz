// views.jsx — primary resource screens for the broad-sweep prototype:
//   ServersView (quick-connect, toolbar, host card grid, detail panel)
//   SftpView (dual-pane remote/local file manager)
//   PortForwardingView (forwarding rules with live toggles)
//   HistoryView (recent connections, search + failure states)
//   Shared atoms: StatusDot, ProtocolBadge, Tag, Switch, ToolButton, PageHeader, EmptyState
// Self-contained UI state; call out via onConnect / onReconnect. Exported to `window`.

const { useState, useMemo, useRef, useEffect } = React;
const { Icon } = window;
const { INV } = window;

/* ----------------------------------------------------------------------------
 * Shared atoms
 * ------------------------------------------------------------------------- */

const STATUS_LABEL = {
  online: "Online",
  offline: "Offline",
  connected: "Connected",
  connecting: "Connecting…",
  failed: "Failed",
  success: "Success",
};

function StatusDot({ status, size = 7 }) {
  const color =
    status === "online" || status === "connected" || status === "success"
      ? "bg-pulse-green"
      : status === "failed"
      ? "bg-coral-red"
      : status === "connecting"
      ? "bg-yellow-400"
      : "bg-fog/45";
  const ring =
    status === "online" || status === "connected" ? "ring-2 ring-pulse-green/15" : "";
  return (
    <span
      aria-label={STATUS_LABEL[status] ?? status}
      title={STATUS_LABEL[status] ?? status}
      className={"inline-block rounded-full " + color + " " + ring}
      style={{ width: size, height: size }}
    />
  );
}

const PROTOCOL_STYLE = {
  ssh: { label: "SSH", cls: "bg-signal-teal/12 text-signal-teal", icon: "terminal" },
  telnet: { label: "Telnet", cls: "bg-iris-violet/12 text-lavender", icon: "globe" },
  serial: { label: "Serial", cls: "bg-acid-lime/12 text-acid-lime", icon: "route" },
};

function ProtocolBadge({ protocol }) {
  const s = PROTOCOL_STYLE[protocol] ?? PROTOCOL_STYLE.ssh;
  return (
    <span className={"inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] " + s.cls}>
      <Icon name={s.icon} size={11} />
      {s.label}
    </span>
  );
}

function Tag({ children, onClick }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-graphite/80 px-2 py-0.5 text-[11px] text-fog">
      <Icon name="hash" size={9} className="text-fog/60" />
      {children}
    </span>
  );
}

function ToolButton({ icon, label, onClick, primary, ariaLabel }) {
  const cls = primary
    ? "inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3 py-1.5 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105"
    : "inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist";
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={cls}>
      <Icon name={icon} size={14} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}

function IconGhost({ icon, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function Switch({ on, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      className={
        "relative h-[20px] w-[34px] rounded-full transition-colors " +
        (on ? "bg-acid-lime/80" : "bg-smoke")
      }
    >
      <span
        className={
          "absolute top-[2px] h-4 w-4 rounded-full bg-paper transition-all " +
          (on ? "left-[16px]" : "left-[2px]")
        }
      />
    </button>
  );
}

function PageHeader({ title, subtitle, icon, actions }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-mist">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="m-0 text-[16px] font-semibold tracking-tight text-paper">{title}</h1>
          {subtitle ? <p className="m-0 mt-0.5 text-[12px] text-fog">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

function EmptyState({ icon = "server", title, body, action }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-graphite bg-obsidian/60 text-fog">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="m-0 mt-3 text-[14px] font-semibold text-mist">{title}</h3>
      {body ? <p className="m-0 mt-1 max-w-[320px] text-[12.5px] leading-relaxed text-fog">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

function hostEndpoint(h) {
  if (h.protocol === "serial") return `${h.address} @ ${h.baudRate}`;
  return `${h.username}@${h.address}${h.port && h.port !== 22 ? ":" + h.port : ""}`;
}

/* ----------------------------------------------------------------------------
 * Servers
 * ------------------------------------------------------------------------- */

function QuickConnectBar({ onConnect }) {
  const [value, setValue] = useState("");
  const looksValid = /^(ssh\s+)?[\w.-]+@[\w.-]+/.test(value.trim()) || value.trim().length > 0;
  const canConnect = value.trim().length > 0;
  const submit = () => {
    if (!canConnect) return;
    onConnect({ quick: true, raw: value.trim() });
    setValue("");
  };
  return (
    <div className="px-5 pt-4">
      <div className="flex items-center gap-2 rounded-xl border border-graphite bg-obsidian/50 px-3 py-2 transition-colors focus-within:border-smoke">
        <Icon name="search" size={16} className="shrink-0 text-fog" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Search servers or connect directly — try “ssh deploy@10.0.0.20”"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-mist outline-none placeholder:text-fog/60"
        />
        {value ? (
          <button type="button" aria-label="Clear" onClick={() => setValue("")} className="grid h-7 w-7 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist">
            <Icon name="x" size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={!canConnect}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " +
            (canConnect ? "bg-acid-lime text-void hover:brightness-105" : "bg-graphite text-fog")
          }
        >
          <Icon name="external" size={14} />
          Connect
        </button>
      </div>
    </div>
  );
}

function HostCard({ host, selected, onSelect }) {
  return (
    <div
      data-active={selected || undefined}
      onClick={() => onSelect(host.id)}
      className={
        "group card relative cursor-pointer rounded-xl border bg-obsidian/40 p-3.5 transition-colors " +
        (selected ? "border-acid-lime/60 bg-graphite/60" : "border-graphite hover:border-smoke hover:bg-graphite/40")
      }
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 shrink-0">
          <StatusDot status={host.status} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="m-0 truncate text-[14px] font-semibold tracking-tight text-paper">{host.name}</h3>
          </div>
          <p className="m-0 mt-0.5 truncate font-mono text-[11.5px] text-fog">{hostEndpoint(host)}</p>
        </div>
        <span className="opacity-0 transition-opacity group-hover:opacity-60">
          <Icon name="grip" size={14} className="text-fog" />
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <ProtocolBadge protocol={host.protocol} />
        {host.jumpHost ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-fog" title={"Jump host: " + host.jumpHost}>
            <Icon name="route" size={11} />
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
        <span className="truncate">{host.label}</span>
        <span className="shrink-0">{host.lastConnected}</span>
      </div>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 py-1">
      <dt className="text-[11.5px] uppercase tracking-[0.05em] text-fog/80">{label}</dt>
      <dd className={"m-0 truncate text-[12.5px] text-mist " + (mono ? "font-mono" : "")}>{value || "—"}</dd>
    </div>
  );
}

function HostDetail({ host, onConnect, onClose, onEdit }) {
  if (!host) return null;
  const group = INV.GROUPS.find((g) => g.id === host.group) || { name: host.group };
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-graphite bg-carbon">
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className="mt-1"><StatusDot status={host.status} size={9} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[15px] font-semibold tracking-tight text-paper">{host.name}</h2>
          <p className="m-0 mt-0.5 truncate font-mono text-[11.5px] text-fog">{hostEndpoint(host)}</p>
        </div>
        <IconGhost icon="edit" label="Edit" onClick={() => onEdit?.(host)} />
        <IconGhost icon="more" label="More" />
        <IconGhost icon="x" label="Close" onClick={onClose} />
      </header>

      <div className="px-4">
        <button
          type="button"
          onClick={() => onConnect(host)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-acid-lime py-2 text-[13px] font-semibold tracking-tight text-void transition-colors hover:brightness-105"
        >
          <Icon name="power" size={15} />
          Connect
        </button>
      </div>

      <div className="scroll-thin mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <Section title="Connection">
          <Field label="Protocol" value={<ProtocolBadge protocol={host.protocol} />} />
          <Field label="Address" value={host.address} mono />
          {host.port ? <Field label="Port" value={String(host.port)} mono /> : null}
          {host.baudRate ? <Field label="Baud rate" value={host.baudRate + " 8N1"} mono /> : null}
          <Field label="Username" value={host.username} mono />
          <Field label="Identity" value={host.identity} mono />
          <Field label="Group" value={group?.name} />
        </Section>

        <Section title="Routing">
          <Field label="Jump host" value={host.jumpHost} mono />
          <Field label="Proxy" value={host.proxy} mono />
        </Section>

        {Object.keys(host.env).length > 0 ? (
          <Section title="Environment">
            {Object.entries(host.env).map(([k, v]) => (
              <Field key={k} label={k} value={v} mono />
            ))}
          </Section>
        ) : null}

        <Section title="Startup snippets">
          {host.startupSnippets.length > 0 ? (
            <div className="grid gap-1">
              {host.startupSnippets.map((sid) => {
                const snip = INV.SNIPPETS.find((s) => s.id === sid);
                return (
                  <div key={sid} className="min-w-0 rounded-md border border-graphite/70 bg-obsidian/40 px-2.5 py-1.5">
                    <div className="text-[12px] text-mist">{snip?.name ?? sid}</div>
                    <div className="truncate font-mono text-[11px] text-fog" title={snip?.command}>{snip?.command}</div>
                  </div>
                );
              })}
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

function Section({ title, children }) {
  return (
    <section className="border-t border-graphite/70 py-3 first:border-t-0 first:pt-0">
      <h4 className="m-0 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">{title}</h4>
      <div>{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Create / edit forms (inline right panel)
 * ------------------------------------------------------------------------- */

const inputCls =
  "w-full rounded-md border border-graphite bg-carbon px-2.5 py-1.5 text-[12.5px] text-mist outline-none transition-colors placeholder:text-fog/45 focus:border-smoke";

function Labeled({ label, required, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.05em] text-fog/80">
        {label}
        {required ? <span className="text-coral-red">*</span> : null}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[11px] leading-relaxed text-fog/70">{hint}</div> : null}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, mono, autoFocus, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={inputCls + (mono ? " font-mono" : "")}
    />
  );
}

function SelectInput({ value, onChange, children }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls + " appearance-none pr-7"}>
        {children}
      </select>
      <Icon name="chevron-down" size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fog" />
    </div>
  );
}

function ChipInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-graphite bg-carbon p-1.5 transition-colors focus-within:border-smoke">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-pill bg-graphite/80 px-2 py-0.5 text-[11.5px] text-mist">
          {t}
          <button type="button" aria-label={"Remove " + t} onClick={() => onChange(value.filter((x) => x !== t))} className="text-fog hover:text-coral-red">
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[90px] flex-1 bg-transparent px-1 py-0.5 text-[12px] text-mist outline-none placeholder:text-fog/45"
      />
    </div>
  );
}

function KeyValueEditor({ value, onChange }) {
  const entries = Object.entries(value);
  const rebuild = (arr) => onChange(Object.fromEntries(arr.filter(([k]) => k.trim() !== "")));
  return (
    <div className="grid gap-1.5">
      {entries.length === 0 ? <p className="m-0 text-[11.5px] text-fog/70">No variables set.</p> : null}
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className={inputCls + " font-mono"}
            value={k}
            onChange={(e) => { const arr = entries.slice(); arr[i] = [e.target.value, v]; rebuild(arr); }}
            placeholder="KEY"
          />
          <span className="text-fog/60">=</span>
          <input
            className={inputCls + " font-mono"}
            value={v}
            onChange={(e) => { const arr = entries.slice(); arr[i] = [k, e.target.value]; rebuild(arr); }}
            placeholder="value"
          />
          <button type="button" aria-label="Remove variable" onClick={() => rebuild(entries.filter((_, j) => j !== i))} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-fog hover:bg-coral-red/12 hover:text-coral-red">
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...value, ["NEW_VAR_" + (entries.length + 1)]: "" })} className="inline-flex items-center gap-1 self-start rounded-md border border-graphite px-2 py-1 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
        <Icon name="plus" size={12} />Add variable
      </button>
    </div>
  );
}

function MultiCheck({ options, value, onChange }) {
  return (
    <div className="grid gap-1">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-mist hover:bg-white/5">
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} className="h-3.5 w-3.5 accent-[#e4f222]" />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            <span className="hidden truncate font-mono text-[10.5px] text-fog sm:inline">{o.command}</span>
          </label>
        );
      })}
    </div>
  );
}

function newHostId() {
  return "h-" + Math.random().toString(36).slice(2, 8);
}

function HostForm({ groups, identities, hosts, snippets, initial, onSave, onCancel }) {
  const editing = !!initial;
  const [d, setD] = useState(() => ({
    id: initial?.id ?? newHostId(),
    name: initial?.name ?? "",
    group: initial?.group ?? groups[0]?.id ?? "g-prod",
    protocol: initial?.protocol ?? "ssh",
    address: initial?.address ?? "",
    port: initial?.port ?? 22,
    baudRate: initial?.baudRate ?? 115200,
    username: initial?.username ?? "",
    identity: initial?.identity ?? null,
    tags: initial?.tags ?? [],
    jumpHost: initial?.jumpHost ?? null,
    proxy: initial?.proxy ?? null,
    env: initial?.env ?? {},
    startupSnippets: initial?.startupSnippets ?? [],
    status: initial?.status ?? "offline",
    label: initial?.label ?? "",
    lastConnected: initial?.lastConnected ?? "never",
  }));
  const set = (patch) => setD((p) => ({ ...p, ...patch }));
  const onProtocol = (protocol) => set({ protocol, port: protocol === "telnet" ? 23 : 22 });
  const isSerial = d.protocol === "serial";
  const valid = !!d.name.trim() && !!d.address.trim();

  const submit = () => {
    if (!valid) return;
    const label =
      d.label ||
      (isSerial ? "Serial · " + d.baudRate + " 8N1" : (d.protocol === "ssh" ? "SSH · " : "Telnet · ") + d.address);
    onSave({ ...d, name: d.name.trim(), label });
  };

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-graphite bg-carbon">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">{editing ? "Edit server" : "New server"}</h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-fog">{editing ? "Update connection settings" : "Add a host to this vault"}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onCancel} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist">
          <Icon name="x" size={16} />
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-3">
          <Labeled label="Name" required>
            <TextInput value={d.name} onChange={(v) => set({ name: v })} placeholder="web-prod-03" autoFocus />
          </Labeled>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Protocol">
              <SelectInput value={d.protocol} onChange={onProtocol}>
                <option value="ssh">SSH</option>
                <option value="telnet">Telnet</option>
                <option value="serial">Serial</option>
              </SelectInput>
            </Labeled>
            <Labeled label="Group">
              <SelectInput value={d.group} onChange={(v) => set({ group: v })}>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </SelectInput>
            </Labeled>
          </div>

          {isSerial ? (
            <>
              <Labeled label="Device path" required>
                <TextInput value={d.address} onChange={(v) => set({ address: v })} placeholder="/dev/tty.usbserial-AB0" mono />
              </Labeled>
              <Labeled label="Baud rate">
                <TextInput type="number" value={String(d.baudRate)} onChange={(v) => set({ baudRate: Number(v) || 0 })} mono />
              </Labeled>
            </>
          ) : (
            <>
              <Labeled label="Address / hostname" required>
                <TextInput value={d.address} onChange={(v) => set({ address: v })} placeholder="10.0.0.30" mono />
              </Labeled>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Port">
                  <TextInput type="number" value={String(d.port)} onChange={(v) => set({ port: Number(v) || 0 })} mono />
                </Labeled>
                <Labeled label="Username">
                  <TextInput value={d.username} onChange={(v) => set({ username: v })} placeholder="ubuntu" mono />
                </Labeled>
              </div>
              {d.protocol === "ssh" ? (
                <Labeled label="Identity">
                  <SelectInput value={d.identity ?? ""} onChange={(v) => set({ identity: v || null })}>
                    <option value="">None (password)</option>
                    {identities.filter((i) => i.type !== "SSH certificate").map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
                  </SelectInput>
                </Labeled>
              ) : null}
            </>
          )}

          <Labeled label="Jump host" hint="Route through a bastion / jump host">
            <SelectInput value={d.jumpHost ?? ""} onChange={(v) => set({ jumpHost: v || null })}>
              <option value="">None (direct)</option>
              {hosts.filter((h) => h.id !== d.id && h.protocol !== "serial").map((h) => <option key={h.id} value={h.name}>{h.name}</option>)}
            </SelectInput>
          </Labeled>

          <Labeled label="Proxy" hint="SOCKS or HTTP proxy (host:port), optional">
            <TextInput value={d.proxy ?? ""} onChange={(v) => set({ proxy: v || null })} placeholder="none" mono />
          </Labeled>

          <Labeled label="Tags">
            <ChipInput value={d.tags} onChange={(tags) => set({ tags })} placeholder="Add tag + ⏎" />
          </Labeled>

          <Labeled label="Environment variables">
            <KeyValueEditor value={d.env} onChange={(env) => set({ env })} />
          </Labeled>

          <Labeled label="Startup snippets" hint="Run automatically when connecting">
            <MultiCheck options={snippets} value={d.startupSnippets} onChange={(startupSnippets) => set({ startupSnippets })} />
          </Labeled>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-graphite bg-obsidian/40 px-4 py-3">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">Cancel</button>
        <button type="button" onClick={submit} disabled={!valid} className={"rounded-md px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " + (valid ? "bg-acid-lime text-void hover:brightness-105" : "cursor-not-allowed bg-graphite text-fog")}>
          {editing ? "Save changes" : "Create server"}
        </button>
      </footer>
    </aside>
  );
}

const GROUP_COLORS = [["coral", "#eb5757"], ["teal", "#02b8cc"], ["violet", "#8b5cf6"], ["lime", "#e4f222"], ["fog", "#8a8f98"]];

function GroupForm({ onSave, onCancel }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("teal");
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    onSave({ id: "g-" + Math.random().toString(36).slice(2, 7), name: name.trim(), color, count: 0 });
  };
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-graphite bg-carbon">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">New group</h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-fog">Organize hosts into a group</p>
        </div>
        <button type="button" aria-label="Close" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist">
          <Icon name="x" size={16} />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-4">
          <Labeled label="Name" required>
            <TextInput value={name} onChange={setName} placeholder="Databases" autoFocus />
          </Labeled>
          <Labeled label="Color">
            <div className="flex items-center gap-2.5">
              {GROUP_COLORS.map(([n, c]) => (
                <button
                  key={n}
                  type="button"
                  aria-label={n}
                  aria-pressed={color === n}
                  onClick={() => setColor(n)}
                  className={"h-7 w-7 rounded-full transition-transform " + (color === n ? "ring-2 ring-paper ring-offset-2 ring-offset-carbon" : "opacity-70 hover:opacity-100")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Labeled>
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-graphite bg-obsidian/40 px-4 py-3">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">Cancel</button>
        <button type="button" onClick={submit} disabled={!valid} className={"rounded-md px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " + (valid ? "bg-acid-lime text-void hover:brightness-105" : "cursor-not-allowed bg-graphite text-fog")}>
          Create group
        </button>
      </footer>
    </aside>
  );
}

function ServersToolbar({ onNewHost, onNewGroup, onImport, layout, setLayout, tag, setTag, allTags }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onNewHost} className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-mist transition-colors hover:bg-white/5">
          <Icon name="plus" size={14} />New Server
        </button>
        <button type="button" onClick={onNewGroup} className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
          <Icon name="folder" size={14} />New Group
        </button>
        <button type="button" onClick={onImport} className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
          <Icon name="upload" size={14} />Import
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <label className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog">
          <Icon name="filter" size={13} />
          <span className="text-fog/70">Tag</span>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="bg-transparent text-mist outline-none"
          >
            <option value="">All</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist" title="Sort">
          <Icon name="sort" size={13} />Sort
        </button>
        <div className="flex items-center rounded-md border border-graphite p-0.5">
          <button type="button" aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={"grid h-7 w-7 place-items-center rounded " + (layout === "grid" ? "bg-graphite text-mist" : "text-fog hover:text-mist")}>
            <Icon name="grid" size={15} />
          </button>
          <button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => setLayout("list")} className={"grid h-7 w-7 place-items-center rounded " + (layout === "list" ? "bg-graphite text-mist" : "text-fog hover:text-mist")}>
            <Icon name="list" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupRail({ groups, hosts }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-5 pb-2 scroll-thin">
      <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-fog/60">Groups</span>
      {groups.map((g) => (
        <span key={g.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-graphite px-2.5 py-1 text-[12px] text-fog">
          <span className="h-2 w-2 rounded-full" style={{ background: groupColor(g.color) }} />
          {g.name}
          <span className="text-fog/60">{hosts.filter((h) => h.group === g.id).length}</span>
        </span>
      ))}
    </div>
  );
}

function groupColor(name) {
  switch (name) {
    case "coral": return "#eb5757";
    case "teal": return "#02b8cc";
    case "violet": return "#8b5cf6";
    case "lime": return "#e4f222";
    default: return "#8a8f98";
  }
}

function HostRow({ host, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(host.id)}
      className={
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors " +
        (selected ? "border-acid-lime/60 bg-graphite/60" : "border-graphite/60 hover:bg-white/5")
      }
    >
      <StatusDot status={host.status} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-mist">{host.name}</div>
        <div className="truncate font-mono text-[11.5px] text-fog">{hostEndpoint(host)}</div>
      </div>
      <ProtocolBadge protocol={host.protocol} />
      <span className="hidden text-[11.5px] text-fog sm:inline">{host.lastConnected}</span>
      <Icon name="chevron-right" size={14} className="text-fog/60" />
    </button>
  );
}

function ServersView({ onConnect }) {
  const [hosts, setHosts] = useState(INV.HOSTS);
  const [groups, setGroups] = useState(INV.GROUPS);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [layout, setLayout] = useState("grid");
  // panel: null | {type:"detail",id} | {type:"new-server"} | {type:"edit-server",id} | {type:"new-group"}
  const [panel, setPanel] = useState(null);

  const allTags = useMemo(
    () => Array.from(new Set(hosts.flatMap((h) => h.tags))).sort(),
    [hosts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hosts.filter((h) => {
      if (tag && !h.tags.includes(tag)) return false;
      if (!q) return true;
      return (
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.username.toLowerCase().includes(q) ||
        h.tags.some((t) => t.includes(q))
      );
    });
  }, [hosts, query, tag]);

  const selectHost = (id) => setPanel({ type: "detail", id });
  const selected =
    panel && (panel.type === "detail" || panel.type === "edit-server")
      ? hosts.find((h) => h.id === panel.id) || null
      : null;

  const handleSaveHost = (draft) => {
    setHosts((prev) => (prev.some((h) => h.id === draft.id) ? prev.map((h) => (h.id === draft.id ? draft : h)) : [draft, ...prev]));
    setPanel({ type: "detail", id: draft.id });
  };
  const handleSaveGroup = (g) => {
    setGroups((prev) => [...prev, g]);
    setPanel(null);
  };

  const renderRightPanel = () => {
    if (panel?.type === "new-server")
      return (
        <HostForm
          groups={groups}
          identities={INV.IDENTITIES}
          hosts={hosts}
          snippets={INV.SNIPPETS}
          onSave={handleSaveHost}
          onCancel={() => setPanel(null)}
        />
      );
    if (panel?.type === "new-group")
      return <GroupForm onSave={handleSaveGroup} onCancel={() => setPanel(null)} />;
    if (panel?.type === "edit-server" && selected)
      return (
        <HostForm
          groups={groups}
          identities={INV.IDENTITIES}
          hosts={hosts}
          snippets={INV.SNIPPETS}
          initial={selected}
          onSave={handleSaveHost}
          onCancel={() => setPanel({ type: "detail", id: selected.id })}
        />
      );
    if (selected)
      return (
        <HostDetail
          host={selected}
          onConnect={onConnect}
          onClose={() => setPanel(null)}
          onEdit={(h) => setPanel({ type: "edit-server", id: h.id })}
        />
      );
    return null;
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <QuickConnectBar onConnect={onConnect} />
        <ServersToolbar
          onNewHost={() => setPanel({ type: "new-server" })}
          onNewGroup={() => setPanel({ type: "new-group" })}
          onImport={() => {}}
          layout={layout}
          setLayout={setLayout}
          tag={tag}
          setTag={setTag}
          allTags={allTags}
        />
        <GroupRail groups={groups} hosts={hosts} />

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title="No servers match"
              body="Try a different search term, clear the tag filter, or add a new server."
              action={<button type="button" onClick={() => setPanel({ type: "new-server" })} className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3 py-1.5 text-[12.5px] font-semibold text-void"><Icon name="plus" size={14} />New Server</button>}
            />
          ) : layout === "grid" ? (
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {filtered.map((h) => (
                <HostCard key={h.id} host={h} selected={panel?.type !== "new-group" && panel?.id === h.id} onSelect={selectHost} />
              ))}
            </div>
          ) : (
            <div className="grid gap-1.5">
              {filtered.map((h) => (
                <HostRow key={h.id} host={h} selected={panel?.type !== "new-group" && panel?.id === h.id} onSelect={selectHost} />
              ))}
            </div>
          )}
        </div>
      </div>
      {renderRightPanel()}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * SFTP — dual-pane file manager
 * ------------------------------------------------------------------------- */

const DEFAULT_REMOTE_PATHS = {
  "web-prod-01": "/var/www/shop",
  "web-prod-02": "/var/www/shop",
  "api-prod-01": "/srv/api",
  "bastion-jump": "/home/bridge/uploads",
  "db-primary": "/etc/postgresql/15/main",
  "stage-app-01": "/srv/stage-app/current",
};

function filesForRemoteHost(hostName) {
  if (hostName === "db-primary") {
    return [
      { id: "pg-1", name: "postgresql.conf", isDir: false, size: "23 KB", modified: "Jul 19  2026", perms: "-rw-r--r--" },
      { id: "pg-2", name: "pg_hba.conf", isDir: false, size: "4.6 KB", modified: "Jul 19  2026", perms: "-rw-r--r--" },
      { id: "pg-3", name: "pg_ident.conf", isDir: false, size: "1.6 KB", modified: "Jul 19  2026", perms: "-rw-r--r--" },
      { id: "pg-4", name: "data", isDir: true, size: "—", modified: "Jul 25 09:14", perms: "drwx------" },
      { id: "pg-5", name: "backups", isDir: true, size: "—", modified: "Jul 24  2026", perms: "drwxr-xr-x" },
      { id: "pg-6", name: "recovery.signal", isDir: false, size: "0 B", modified: "Jul 19  2026", perms: "-rw-r--r--" },
    ];
  }
  if (hostName === "bastion-jump") {
    return [
      { id: "bj-1", name: "uploads", isDir: true, size: "—", modified: "Today", perms: "drwxr-xr-x" },
      { id: "bj-2", name: "audit.log", isDir: false, size: "1.4 MB", modified: "09:08", perms: "-rw-r-----" },
      { id: "bj-3", name: "ssh_config", isDir: false, size: "2.1 KB", modified: "Jul 20  2026", perms: "-rw-------" },
      { id: "bj-4", name: "known_hosts", isDir: false, size: "3.0 KB", modified: "Jul 18  2026", perms: "-rw-r--r--" },
    ];
  }
  if (hostName === "stage-app-01") {
    return [
      { id: "sa-1", name: "current", isDir: true, size: "—", modified: "Jul 23  2026", perms: "lrwxrwxrwx" },
      { id: "sa-2", name: "releases", isDir: true, size: "—", modified: "Jul 23  2026", perms: "drwxr-xr-x" },
      { id: "sa-3", name: "shared", isDir: true, size: "—", modified: "Jul 23  2026", perms: "drwxr-xr-x" },
      { id: "sa-4", name: ".env.stage", isDir: false, size: "1.0 KB", modified: "Jul 22  2026", perms: "-rw-------" },
      { id: "sa-5", name: "deploy.log", isDir: false, size: "18 KB", modified: "09:21", perms: "-rw-r--r--" },
    ];
  }
  return INV.SFTP_FILES;
}

function SourcePicker({ source, sources, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fog/80 transition-colors hover:bg-white/5 hover:text-mist focus-ring"
        aria-label={"Switch source from " + source.label}
      >
        <Icon
          name={source.icon}
          size={13}
          className={"shrink-0 " + (source.kind === "local" ? "text-signal-teal" : "text-lavender")}
        />
        <span className="normal-case tracking-normal text-mist">{source.label}</span>
        <Icon
          name="chevron-down"
          size={11}
          className={"shrink-0 text-fog/50 transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-[244px] rounded-lg border border-graphite bg-carbon p-1 shadow-2xl pop-in">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-fog/50">
            Switch source
          </div>
          {sources.map((s) => {
            const active = s.id === source.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => { onSelect(s); setOpen(false); }}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors " +
                  (active ? "bg-graphite text-paper" : "text-fog hover:bg-white/5 hover:text-mist")
                }
              >
                <Icon
                  name={s.icon}
                  size={13}
                  className={"shrink-0 " + (s.kind === "local" ? "text-signal-teal" : "text-lavender")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-mist">{s.label}</span>
                  {s.sublabel ? (
                    <span className="block truncate font-mono text-[10.5px] text-fog/60">{s.sublabel}</span>
                  ) : null}
                </span>
                {s.online === false ? (
                  <span className="shrink-0 rounded-pill bg-coral-red/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-coral-red">
                    offline
                  </span>
                ) : active ? (
                  <Icon name="check" size={12} className="shrink-0 text-acid-lime" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FilePane({ source, sources, onSourceChange, files, onUpload, onDownload }) {
  const [selected, setSelected] = useState(null);
  const isRemote = source.kind === "remote";
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-graphite/70 bg-obsidian/30">
      <header className="flex items-center justify-between gap-2 border-b border-graphite/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourcePicker source={source} sources={sources} onSelect={onSourceChange} />
          <span className="truncate rounded-pill bg-graphite/60 px-2 py-0.5 font-mono text-[11px] text-fog">{source.path}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {isRemote ? (
            <>
              <IconGhost icon="folder" label="New folder" />
              <IconGhost icon="upload" label="Upload" onClick={onUpload} />
            </>
          ) : (
            <IconGhost icon="download" label="Download" onClick={onDownload} />
          )}
          <IconGhost icon="refresh" label="Refresh" />
          <IconGhost icon="more" label="More" />
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-carbon text-[10.5px] uppercase tracking-[0.05em] text-fog/60">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Name</th>
              <th className="px-3 py-1.5 text-right font-medium">Size</th>
              <th className="hidden px-3 py-1.5 text-left font-medium md:table-cell">Modified</th>
              <th className="hidden px-3 py-1.5 text-left font-medium lg:table-cell">Perms</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const active = selected === f.id;
              return (
                <tr
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  className={"cursor-pointer border-t border-graphite/40 " + (active ? "bg-acid-lime/10" : "hover:bg-white/5")}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Icon name={f.isDir ? "folder" : "file"} size={14} className={f.isDir ? "text-signal-teal" : "text-fog/70"} />
                      <span className={"truncate " + (active ? "text-paper" : "text-mist")}>{f.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[11.5px] text-fog">{f.size}</td>
                  <td className="hidden px-3 py-1.5 font-mono text-[11.5px] text-fog md:table-cell">{f.modified}</td>
                  <td className="hidden px-3 py-1.5 font-mono text-[11.5px] text-fog/80 lg:table-cell">{f.perms}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SftpView() {
  const { SFTP_RECENT, HOSTS } = INV;
  const sshHosts = HOSTS.filter((h) => h.protocol === "ssh");

  // Each pane can point at any source — Local or any SSH host.
  const sources = useMemo(() => [
    {
      id: "src-local",
      label: "Local",
      sublabel: "~/buzz",
      icon: "monitor",
      kind: "local",
      path: "~/buzz",
      online: true,
      files: [
        { id: "l-1", name: "Downloads", isDir: true, size: "—", modified: "Today", perms: "drwxr-xr-x" },
        { id: "l-2", name: "shop-backup-Jul25.tar.gz", isDir: false, size: "82 MB", modified: "09:12", perms: "-rw-r--r--" },
        { id: "l-3", name: "deploy.sh", isDir: false, size: "4.4 KB", modified: "Jul 22", perms: "-rwxr-xr-x" },
        { id: "l-4", name: ".env.local", isDir: false, size: "1.1 KB", modified: "Jul 25", perms: "-rw-------" },
        { id: "l-5", name: "logs", isDir: true, size: "—", modified: "Mon", perms: "drwxr-xr-x" },
      ],
    },
    ...sshHosts.map((h) => ({
      id: "src-" + h.id,
      label: h.name,
      sublabel: h.username + "@" + h.address,
      icon: "server",
      kind: "remote",
      path: DEFAULT_REMOTE_PATHS[h.name] || "/",
      online: h.status !== "offline",
      files: filesForRemoteHost(h.name),
    })),
  ], []);

  // Activation starts disconnected: no host is pre-selected and nothing opens
  // until the user picks a host + path and presses Connect.
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected | error
  const [error, setError] = useState("");
  const [draftHost, setDraftHost] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [topSourceId, setTopSourceId] = useState(null);
  const [bottomSourceId, setBottomSourceId] = useState("src-local");
  const busy = status === "connecting";

  const connect = (host, path) => {
    const h = (host ?? draftHost).trim();
    if (!h || busy) return;
    const p = (path ?? draftPath).trim() || "/";
    void p;
    setError("");
    setStatus("connecting");
    window.setTimeout(() => {
      const rec = sshHosts.find((x) => x.name === h);
      if (rec && rec.status === "offline") {
        setStatus("error");
        setError(`Connection refused — ${h} is offline or unreachable.`);
        return;
      }
      const src = sources.find((s) => s.kind === "remote" && s.label === h);
      if (src) setTopSourceId(src.id);
      setStatus("connected");
    }, 850);
  };
  const disconnect = () => {
    setStatus("disconnected");
    setTopSourceId(null);
    setError("");
  };
  const pickRecent = (entry) => {
    setDraftHost(entry.host);
    setDraftPath(entry.path);
    connect(entry.host, entry.path);
  };

  if (status !== "connected") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader icon="folder" title="SFTP" subtitle="Transfer files between your machine and connected hosts" />
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {/* Quick connect bar */}
          <div className="mx-auto max-w-[680px]">
            <div className="flex items-center gap-2 rounded-xl border border-graphite bg-obsidian/50 px-3 py-1.5 transition-colors focus-within:border-smoke">
              <Icon name="server" size={15} className="shrink-0 text-fog" />
              <select
                value={draftHost}
                onChange={(e) => setDraftHost(e.target.value)}
                aria-label="Host"
                className="shrink-0 bg-transparent text-[12.5px] text-mist outline-none"
              >
                <option value="" disabled>Choose a host…</option>
                {sshHosts.map((h) => <option key={h.id} value={h.name}>{h.username}@{h.name}</option>)}
              </select>
              <span className="text-fog/40">·</span>
              <span className="shrink-0 text-[11px] text-fog/70">path</span>
              <input
                value={draftPath}
                onChange={(e) => setDraftPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } }}
                placeholder="/var/www/shop"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-mist outline-none placeholder:text-fog/45"
              />
              <button
                type="button"
                onClick={() => connect()}
                disabled={busy || !draftHost}
                className={"inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold tracking-tight transition disabled:opacity-50 " + (busy || !draftHost ? "bg-graphite text-fog cursor-not-allowed" : "bg-acid-lime text-void hover:brightness-105")}
              >
                {busy ? <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-void/30 border-t-void" /> : <Icon name="external" size={13} />}
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>

            {status === "error" ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-coral-red/30 bg-coral-red/[0.06] px-3.5 py-3">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-coral-red" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[12.5px] font-semibold text-coral-red">Couldn't connect</p>
                  <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-fog">{error}</p>
                </div>
                <button type="button" onClick={() => setStatus("disconnected")} className="shrink-0 rounded-md border border-coral-red/30 px-2.5 py-1 text-[11.5px] text-coral-red transition-colors hover:bg-coral-red/10">
                  Dismiss
                </button>
              </div>
            ) : null}

            {busy ? (
              <p className="m-0 mt-3 flex items-center gap-2 text-[12px] text-fog">
                <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-fog/25 border-t-fog" />
                Opening SFTP session…
              </p>
            ) : null}

            {status === "disconnected" ? (
              <div className="mt-3 flex flex-col items-center rounded-xl border border-dashed border-graphite bg-obsidian/20 px-6 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl border border-graphite bg-obsidian/60 text-fog">
                  <Icon name="folder-open" size={22} />
                </span>
                <h3 className="m-0 mt-3 text-[14px] font-semibold text-mist">No SFTP connection</h3>
                <p className="m-0 mt-1 max-w-[340px] text-[12.5px] leading-relaxed text-fog">
                  Choose a host and remote path above, or pick a recent connection below.
                </p>
              </div>
            ) : null}

            {/* Recent connections */}
            <div className="mt-6">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fog/70">
                <Icon name="history" size={13} /> Recent SFTP
              </div>
              <div className="mt-2 grid gap-1.5">
                {SFTP_RECENT.map((entry) => {
                  const rec = sshHosts.find((x) => x.name === entry.host);
                  const online = rec && rec.status !== "offline";
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => pickRecent(entry)}
                      className="group flex items-center gap-3 rounded-xl border border-graphite/70 bg-obsidian/30 px-3.5 py-2.5 text-left transition-colors hover:border-smoke hover:bg-obsidian/60"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-graphite text-mist">
                        <Icon name="server" size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-mist">{entry.host}</span>
                          <span className={"h-1.5 w-1.5 rounded-full " + (online ? "bg-pulse-green" : "bg-fog/45")} />
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11.5px] text-fog">{entry.path}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-fog/70">{entry.when}</span>
                      <Icon name="external" size={14} className="shrink-0 text-fog/50 transition-colors group-hover:text-acid-lime" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const topSource =
    sources.find((s) => s.id === topSourceId) ||
    sources.find((s) => s.kind === "remote" && s.online !== false) ||
    sources[1] ||
    sources[0];
  const bottomSource =
    sources.find((s) => s.id === bottomSourceId) || sources[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon="folder"
        title="SFTP"
        subtitle="Dual-pane transfer · pick any source from each pane header"
        actions={
          <>
            <ToolButton icon="arrow-up-down" label="Transfer" />
            <IconGhost icon="x" label="Disconnect" onClick={disconnect} />
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_1fr] gap-2.5 px-5 pb-5">
        <FilePane
          key={topSource.id}
          source={topSource}
          sources={sources}
          onSourceChange={(s) => setTopSourceId(s.id)}
          files={topSource.files}
          onUpload={() => {}}
          onDownload={() => {}}
        />
        <FilePane
          key={bottomSource.id}
          source={bottomSource}
          sources={sources}
          onSourceChange={(s) => setBottomSourceId(s.id)}
          files={bottomSource.files}
          onUpload={() => {}}
          onDownload={() => {}}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Port Forwarding
 * ------------------------------------------------------------------------- */

function ForwardRow({ rule, onToggle }) {
  const [running, setRunning] = useState(rule.running);
  const kindStyle = {
    local: { label: "Local", cls: "bg-signal-teal/12 text-signal-teal" },
    remote: { label: "Remote", cls: "bg-iris-violet/12 text-lavender" },
    dynamic: { label: "SOCKS", cls: "bg-acid-lime/12 text-acid-lime" },
  }[rule.kind];
  const target = rule.kind === "dynamic" ? "any (dynamic)" : `${rule.targetHost}:${rule.targetPort}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-graphite/70 bg-obsidian/30 px-3.5 py-3">
      <span className={"inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] " + kindStyle.cls}>
        <Icon name="route" size={11} />
        {kindStyle.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-mist">{rule.label}</span>
          <span className="rounded-pill bg-graphite/60 px-2 py-0.5 text-[11px] text-fog">via {rule.host}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11.5px] text-fog">
          <Icon name="link" size={11} />
          <span>{rule.bindHost}:{rule.bindPort}</span>
          <Icon name="chevron-right" size={11} className="text-fog/50" />
          <span>{target}</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className={"inline-flex items-center gap-1.5 text-[11.5px] " + (running ? "text-pulse-green" : "text-fog/70")}>
          <span className={"h-1.5 w-1.5 rounded-full " + (running ? "bg-pulse-green" : "bg-fog/40")} />
          {running ? "Forwarding" : "Stopped"}
        </span>
        <Switch on={running} ariaLabel={"Toggle " + rule.label} onChange={(v) => { setRunning(v); onToggle?.(rule, v); }} />
        <IconGhost icon="edit" label="Edit" />
        <IconGhost icon="trash" label="Delete" />
      </div>
    </div>
  );
}

function PortForwardingView() {
  const { PORT_FORWARDS } = INV;
  const running = PORT_FORWARDS.filter((r) => r.running).length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon="network"
        title="Port Forwarding"
        subtitle={`${running} of ${PORT_FORWARDS.length} rules forwarding · local, remote & dynamic SOCKS`}
        actions={
          <>
            <ToolButton icon="plus" label="New rule" primary />
          </>
        }
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="grid gap-2">
          {PORT_FORWARDS.map((r) => (
            <ForwardRow key={r.id} rule={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------- */

function HistoryRow({ entry, onReconnect }) {
  const failed = entry.status === "failed";
  const statusCls = {
    success: "bg-pulse-green/12 text-pulse-green",
    connected: "bg-acid-lime/12 text-acid-lime",
    failed: "bg-coral-red/12 text-coral-red",
  }[entry.status];
  const statusLabel = { success: "Success", connected: "Active", failed: "Failed" }[entry.status];
  return (
    <div className={"flex items-center gap-3 rounded-xl border px-3.5 py-3 " + (failed ? "border-coral-red/30 bg-coral-red/[0.04]" : "border-graphite/70 bg-obsidian/30")}>
      <StatusDot status={entry.status === "connected" ? "connected" : entry.status === "success" ? "online" : "failed"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-mist">{entry.user}@{entry.host}</span>
          <ProtocolBadge protocol={entry.protocol} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-fog">
          <span>{entry.when}</span>
          <span className="text-fog/40">·</span>
          <span>{entry.duration}</span>
          {failed ? (
            <>
              <span className="text-fog/40">·</span>
              <span className="inline-flex items-center gap-1 text-coral-red/90">
                <Icon name="alert-circle" size={11} />
                {entry.reason}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <span className={"hidden items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium sm:inline-flex " + statusCls}>
        <Icon name={failed ? "x" : "check"} size={11} />
        {statusLabel}
      </span>
      <button
        type="button"
        onClick={() => onReconnect(entry.host)}
        className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:bg-white/5"
      >
        <Icon name="rotate" size={13} />
        {failed ? "Retry" : "Reconnect"}
      </button>
    </div>
  );
}

function HistoryView({ onReconnect }) {
  const { HISTORY } = INV;
  const [query, setQuery] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const filtered = HISTORY.filter((h) => {
    if (onlyFailed && h.status !== "failed") return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return h.host.toLowerCase().includes(q) || h.user.toLowerCase().includes(q);
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon="history"
        title="History"
        subtitle={`${HISTORY.length} recent connections across all hosts`}
        actions={
          <label className="inline-flex items-center gap-2 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog">
            <Icon name="search" size={13} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history"
              className="w-[150px] bg-transparent text-mist outline-none placeholder:text-fog/60"
            />
          </label>
        }
      />
      <div className="flex items-center gap-2 px-5 pb-2 text-[12px]">
        <button
          type="button"
          onClick={() => setOnlyFailed(false)}
          className={"rounded-pill px-2.5 py-1 transition-colors " + (!onlyFailed ? "bg-graphite text-mist" : "text-fog hover:text-mist")}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setOnlyFailed(true)}
          className={"inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 transition-colors " + (onlyFailed ? "bg-coral-red/15 text-coral-red" : "text-fog hover:text-mist")}
        >
          <Icon name="alert-circle" size={12} />
          Failed only
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {filtered.length === 0 ? (
          <EmptyState icon="search" title="No matching history" body="Adjust your search or clear the failed-only filter." />
        ) : (
          <div className="grid gap-2">
            {filtered.map((h) => (
              <HistoryRow key={h.id} entry={h} onReconnect={onReconnect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  ServersView,
  SftpView,
  PortForwardingView,
  HistoryView,
});
