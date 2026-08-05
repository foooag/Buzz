import { ChevronDown, Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import type {
  CreateHostInput,
  Group,
  Host,
  HostAuthKind,
  Identity,
} from "../../shared/types";

/* ----------------------------------------------------------------------------
 * Field primitives
 * ------------------------------------------------------------------------- */

const inputCls =
  "w-full rounded-md border border-graphite bg-carbon px-2.5 py-1.5 text-[12.5px] text-mist outline-none transition-colors placeholder:text-fog/45 focus:border-smoke";
export const ENCRYPTED_CREDENTIAL_PLACEHOLDER = "••••••••••••••••";

function Labeled({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
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

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={inputCls + (mono ? " font-mono" : "")}
    />
  );
}

function TextAreaInput({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`${inputCls} resize-y font-mono leading-relaxed`}
    />
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputCls + " appearance-none pr-7"}
      >
        {children}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fog"
      />
    </div>
  );
}

function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-graphite bg-carbon p-1.5 transition-colors focus-within:border-smoke">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-pill bg-graphite/80 px-2 py-0.5 text-[11.5px] text-mist"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((x) => x !== tag))}
            className="text-fog hover:text-coral-red"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[90px] flex-1 bg-transparent px-1 py-0.5 text-[12px] text-mist outline-none placeholder:text-fog/45"
      />
    </div>
  );
}

function KeyValueEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  const entries = Object.entries(value);
  const validName = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  const rebuild = (arr: [string, string][]) =>
    onChange(Object.fromEntries(arr.filter(([k]) => k.trim() !== "")));
  return (
    <div className="grid gap-1.5">
      {entries.length === 0 ? <p className="m-0 text-[11.5px] text-fog/70">No variables set.</p> : null}
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className={inputCls + " font-mono"}
            value={k}
            aria-invalid={!validName(k)}
            onChange={(event) => {
              const arr = entries.slice();
              arr[i] = [event.target.value, v];
              rebuild(arr);
            }}
            placeholder="KEY"
          />
          <span className="text-fog/60">=</span>
          <input
            className={inputCls + " font-mono"}
            value={v}
            onChange={(event) => {
              const arr = entries.slice();
              arr[i] = [k, event.target.value];
              rebuild(arr);
            }}
            placeholder="value"
          />
          <button
            type="button"
            aria-label="Remove variable"
            onClick={() => rebuild(entries.filter((_, j) => j !== i))}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-fog hover:bg-coral-red/12 hover:text-coral-red"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {entries.some(([key]) => !validName(key)) ? (
        <p role="alert" className="m-0 text-[11px] text-coral-red">
          Variable names may contain letters, numbers, and underscores, and cannot start with a number.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => onChange({ ...value, [`NEW_VAR_${entries.length + 1}`]: "" })}
        className="inline-flex items-center gap-1 self-start rounded-md border border-graphite px-2 py-1 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
      >
        <Plus size={12} />
        Add variable
      </button>
    </div>
  );
}

function MultiCheck({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string; command: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="grid gap-1">
      {options.map((option) => {
        const on = value.includes(option.id);
        return (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-mist hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() =>
                onChange(on ? value.filter((x) => x !== option.id) : [...value, option.id])
              }
              className="h-3.5 w-3.5 accent-[#e4f222]"
            />
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            <span className="hidden truncate font-mono text-[10.5px] text-fog sm:inline">
              {option.command}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Host form panel
 * ------------------------------------------------------------------------- */

export type HostDraft = CreateHostInput;
export type HostCredentialDraft = {
  authKind: HostAuthKind;
  password: string;
  privateKey: string;
  passphrase: string;
  saveCredential: boolean;
};

export function HostFormPanel({
  groups,
  identities,
  hosts,
  snippets,
  initial,
  savedAuthKind,
  onSave,
  onCancel,
}: {
  groups: Group[];
  identities: Identity[];
  hosts: Host[];
  snippets: { id: string; name: string; command: string }[];
  initial?: Host;
  savedAuthKind?: HostAuthKind;
  onSave: (draft: HostDraft, credential: HostCredentialDraft) => void;
  onCancel: () => void;
}) {
  const editing = Boolean(initial);
  const [authKind, setAuthKind] = useState<HostAuthKind>(
    savedAuthKind ?? initial?.authKind ?? "password",
  );
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [privateKeyFileName, setPrivateKeyFileName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saveCredential, setSaveCredential] = useState(Boolean(savedAuthKind));
  const [startupCommands, setStartupCommands] = useState(
    () => initial?.startupCommands?.join("\n") ?? "",
  );
  const [draft, setDraft] = useState<HostDraft>(() => ({
    vaultId: initial?.vaultId ?? groups[0]?.vaultId ?? "",
    groupId: initial?.groupId ?? groups[0]?.id ?? null,
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    username: initial?.username ?? "",
    tags: initial?.tags ? [...initial.tags] : [],
    notes: initial?.notes ?? "",
    protocol: initial?.protocol ?? "ssh",
    port: initial?.port ?? 22,
    baudRate: initial?.baudRate ?? 115200,
    authKind: savedAuthKind ?? initial?.authKind ?? "password",
    identity: initial?.identity ?? null,
    jumpHost: initial?.jumpHost ?? null,
    proxy: initial?.proxy ?? null,
    env: initial?.env ? { ...initial.env } : {},
    startupSnippets: initial?.startupSnippets ? [...initial.startupSnippets] : [],
    startupCommands: initial?.startupCommands ? [...initial.startupCommands] : [],
    status: initial?.status ?? "offline",
    label: initial?.label ?? "",
    lastConnected: initial?.lastConnected ?? "never",
  }));
  const set = (patch: Partial<HostDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const onProtocol = (protocol: NonNullable<Host["protocol"]>) =>
    set({ protocol, port: protocol === "telnet" ? 23 : 22 });
  const isSerial = draft.protocol === "serial";
  const hasMatchingSavedCredential = savedAuthKind === authKind;
  const enterCredential = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (value) setSaveCredential(true);
  };
  const enteredCredential = authKind === "password" ? password : privateKey;
  const requiresUsername = draft.protocol === "ssh" && authKind === "privateKey";
  const environmentIsValid = Object.keys(draft.env ?? {}).every((name) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(name),
  );
  const valid = Boolean(
    draft.name.trim() &&
    draft.address.trim() &&
    environmentIsValid &&
    (!requiresUsername || draft.username.trim()) &&
    (!saveCredential ||
      (draft.username.trim() && (hasMatchingSavedCredential || enteredCredential))),
  );

  const submit = () => {
    if (!valid) return;
    const label =
      draft.label ||
      (isSerial
        ? `Serial · ${draft.baudRate} 8N1`
        : `${draft.protocol === "ssh" ? "SSH · " : "Telnet · "}${draft.address}`);
    onSave(
      {
        ...draft,
        name: draft.name.trim(),
        label,
        authKind,
        startupCommands: startupCommands
          .split("\n")
          .map((command) => command.trim())
          .filter(Boolean),
      },
      { authKind, password, privateKey, passphrase, saveCredential },
    );
  };

  return (
    <aside
      data-testid="host-form-panel"
      className="flex h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden border-l border-graphite bg-carbon"
    >
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">
            {editing ? "Edit server" : "New server"}
          </h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-fog">
            {editing ? "Update connection settings" : "Add a host to this vault"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist"
        >
          <X size={16} />
        </button>
      </header>

      <div
        data-testid="host-form-scroll-region"
        className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
      >
        <div className="grid gap-3">
          <Labeled label="Name" required>
            <TextInput value={draft.name} onChange={(name) => set({ name })} placeholder="web-prod-03" autoFocus />
          </Labeled>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Protocol">
              <SelectInput value={draft.protocol ?? "ssh"} onChange={(value) => onProtocol(value as NonNullable<Host["protocol"]>)}>
                <option value="ssh">SSH</option>
                <option value="telnet">Telnet</option>
                <option value="serial">Serial</option>
              </SelectInput>
            </Labeled>
            <Labeled label="Group">
              <SelectInput value={draft.groupId ?? ""} onChange={(value) => set({ groupId: value || null })}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectInput>
            </Labeled>
          </div>

          {isSerial ? (
            <>
              <Labeled label="Device path" required>
                <TextInput value={draft.address} onChange={(address) => set({ address })} placeholder="/dev/tty.usbserial-AB0" mono />
              </Labeled>
              <Labeled label="Baud rate">
                <TextInput type="number" value={String(draft.baudRate ?? 115200)} onChange={(value) => set({ baudRate: Number(value) || 0 })} mono />
              </Labeled>
            </>
          ) : (
            <>
              <Labeled label="Address / hostname" required>
                <TextInput value={draft.address} onChange={(address) => set({ address })} placeholder="10.0.0.30" mono />
              </Labeled>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Port">
                  <TextInput type="number" value={String(draft.port ?? 22)} onChange={(value) => set({ port: Number(value) || 0 })} mono />
                </Labeled>
                {draft.protocol !== "ssh" ? (
                  <Labeled label="Username">
                    <TextInput value={draft.username} onChange={(username) => set({ username })} placeholder="ubuntu" mono />
                  </Labeled>
                ) : null}
              </div>
              {draft.protocol === "ssh" ? (
                <>
                  <Labeled label="Identity">
                    <SelectInput
                      value={authKind}
                      onChange={(value) => {
                        const next = value as HostAuthKind;
                        setAuthKind(next);
                        set({ authKind: next });
                        if (!editing && next === "privateKey") {
                          setSaveCredential(true);
                        }
                      }}
                    >
                      <option value="password">Password</option>
                      <option value="privateKey">Private key</option>
                    </SelectInput>
                  </Labeled>
                  {authKind === "password" ? (
                    <>
                      <Labeled label="Username">
                        <TextInput value={draft.username} onChange={(username) => set({ username })} placeholder="ubuntu" mono />
                      </Labeled>
                      <Labeled label="Server password">
                        <TextInput
                          type="password"
                          value={password}
                          onChange={enterCredential(setPassword)}
                          placeholder={
                            hasMatchingSavedCredential
                              ? ENCRYPTED_CREDENTIAL_PLACEHOLDER
                              : undefined
                          }
                        />
                      </Labeled>
                    </>
                  ) : (
                    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
                      <legend className="sr-only">Private key credentials</legend>
                      <Labeled label="Username">
                        <TextInput value={draft.username} onChange={(username) => set({ username })} placeholder="ubuntu" mono />
                      </Labeled>
                      {identities.filter((identity) => identity.type !== "SSH certificate").length > 0 ? (
                        <Labeled label="Identity name" hint="Optional label for this private key">
                          <SelectInput
                            value={draft.identity ?? ""}
                            onChange={(value) => set({ identity: value || null })}
                          >
                            <option value="">Unassigned</option>
                            {identities
                              .filter((identity) => identity.type !== "SSH certificate")
                              .map((identity) => (
                                <option key={identity.id} value={identity.name}>
                                  {identity.name}
                                </option>
                              ))}
                          </SelectInput>
                        </Labeled>
                      ) : null}
                      <div className="flex min-w-0 items-center gap-2">
                        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
                          <Upload size={13} />
                          Choose file
                          <input
                            type="file"
                            aria-label="Import private key file"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.addEventListener("load", () => {
                                if (typeof reader.result === "string") {
                                  enterCredential(setPrivateKey)(reader.result);
                                }
                              });
                              reader.readAsText(file);
                              setPrivateKeyFileName(file.name);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <span
                          className="min-w-0 truncate text-[11px] text-fog/70"
                          title={privateKeyFileName || undefined}
                        >
                          {privateKeyFileName || "No file selected"}
                        </span>
                      </div>
                      <Labeled label="Private key" hint="OpenSSH PEM content; encrypted in the local credential vault">
                        <TextAreaInput
                          value={privateKey}
                          onChange={enterCredential(setPrivateKey)}
                          placeholder={
                            hasMatchingSavedCredential
                              ? ENCRYPTED_CREDENTIAL_PLACEHOLDER
                              : "-----BEGIN OPENSSH PRIVATE KEY-----"
                          }
                          rows={5}
                        />
                      </Labeled>
                      <Labeled label="Passphrase">
                        <TextInput type="password" value={passphrase} onChange={setPassphrase} />
                      </Labeled>
                    </fieldset>
                  )}
                  <label className="flex items-center gap-2 text-[12px] text-mist">
                    <input
                      type="checkbox"
                      checked={saveCredential}
                      onChange={(event) => setSaveCredential(event.target.checked)}
                      className="h-3.5 w-3.5 accent-[#e4f222]"
                    />
                    {authKind === "password"
                      ? "Save password for future connections"
                      : "Save private key for future connections"}
                  </label>
                </>
              ) : null}
            </>
          )}

          <Labeled label="Jump host" hint="Route through a bastion / jump host">
            <SelectInput value={draft.jumpHost ?? ""} onChange={(value) => set({ jumpHost: value || null })}>
              <option value="">None (direct)</option>
              {hosts
                .filter((h) => h.id !== initial?.id && h.protocol !== "serial")
                .map((h) => (
                  <option key={h.id} value={h.name}>
                    {h.name}
                  </option>
                ))}
            </SelectInput>
          </Labeled>

          <Labeled label="Proxy" hint="SOCKS or HTTP proxy (host:port), optional">
            <TextInput value={draft.proxy ?? ""} onChange={(value) => set({ proxy: value || null })} placeholder="none" mono />
          </Labeled>

          <Labeled label="Tags">
            <ChipInput value={draft.tags} onChange={(tags) => set({ tags })} placeholder="Add tag + ⏎" />
          </Labeled>

          <Labeled label="Environment variables">
            <KeyValueEditor value={draft.env ?? {}} onChange={(env) => set({ env })} />
          </Labeled>

          <Labeled label="Startup snippets" hint="Run automatically when connecting">
            <MultiCheck options={snippets} value={draft.startupSnippets ?? []} onChange={(startupSnippets) => set({ startupSnippets })} />
          </Labeled>

          <Labeled label="Custom startup commands" hint="Enter one command per line">
            <TextAreaInput
              value={startupCommands}
              onChange={setStartupCommands}
              placeholder={"cd /srv/app\nsource .venv/bin/activate"}
              rows={4}
            />
          </Labeled>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-graphite bg-obsidian/40 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className={
            "rounded-md px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " +
            (valid ? "bg-acid-lime text-void hover:brightness-105" : "cursor-not-allowed bg-graphite text-fog")
          }
        >
          {editing ? "Save changes" : "Create server"}
        </button>
      </footer>
    </aside>
  );
}

/* ----------------------------------------------------------------------------
 * Group form panel
 * ------------------------------------------------------------------------- */

const GROUP_COLORS = [
  ["coral", "#eb5757"],
  ["teal", "#02b8cc"],
  ["violet", "#8b5cf6"],
  ["lime", "#e4f222"],
  ["fog", "#8a8f98"],
] as const;

export function GroupFormPanel({
  onSave,
  onCancel,
}: {
  onSave: (draft: { name: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("teal");
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    onSave({ name: name.trim(), color });
  };
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-graphite bg-carbon">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">New group</h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-fog">Organize hosts into a group</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-mist"
        >
          <X size={16} />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-4">
          <Labeled label="Name" required>
            <TextInput value={name} onChange={setName} placeholder="Databases" autoFocus />
          </Labeled>
          <Labeled label="Color">
            <div className="flex items-center gap-2.5">
              {GROUP_COLORS.map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={color === name}
                  onClick={() => setColor(name)}
                  className={
                    "h-7 w-7 rounded-full transition-transform " +
                    (color === name
                      ? "ring-2 ring-paper ring-offset-2 ring-offset-carbon"
                      : "opacity-70 hover:opacity-100")
                  }
                  style={{ background: hex }}
                />
              ))}
            </div>
          </Labeled>
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-graphite bg-obsidian/40 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className={
            "rounded-md px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " +
            (valid ? "bg-acid-lime text-void hover:brightness-105" : "cursor-not-allowed bg-graphite text-fog")
          }
        >
          Create group
        </button>
      </footer>
    </aside>
  );
}
