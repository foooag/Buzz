// prefs.jsx — Preferences window (separate-window feel, modal overlay).
// Sections: Terminal (toggles + theme grid + font grid + live preview),
// SFTP (Open-With file associations), Shortcuts (platform key map),
// Known Hosts (host keys + mismatch warnings), Keychain (identities, keys,
// certificates, FIDO2). Exported to `window`.

const { useState } = React;
const { Icon } = window;
const { INV } = window;

const PREF_SECTIONS = [
  { id: "terminal", label: "Terminal", icon: "terminal" },
  { id: "sftp", label: "SFTP", icon: "folder" },
  { id: "shortcuts", label: "Shortcuts", icon: "command" },
  { id: "known", label: "Known Hosts", icon: "shield-check" },
  { id: "keychain", label: "Keychain", icon: "key" },
  { id: "ai", label: "AI Providers", icon: "sparkles" },
];

function Toggle({ on, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-[13px] text-mist">{label}</div>
        {hint ? <div className="mt-0.5 text-[11.5px] text-fog">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={"relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors " + (on ? "bg-acid-lime/80" : "bg-smoke")}
      >
        <span className={"absolute top-[2px] h-4 w-4 rounded-full bg-paper transition-all " + (on ? "left-[16px]" : "left-[2px]")} />
      </button>
    </div>
  );
}

function PrefHeader({ icon, title, subtitle }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-graphite text-mist">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">{title}</h2>
        {subtitle ? <p className="m-0 mt-0.5 text-[12px] text-fog">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={"rounded-xl border border-graphite/70 bg-obsidian/30 p-4 " + className}>{children}</div>;
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-graphite bg-carbon px-1.5 py-0.5 font-sans text-[11px] text-mist">{children}</kbd>
  );
}

/* ---- Terminal section ------------------------------------------------ */

function ThemeGrid({ themes, value, onChange }) {
  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
      {themes.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            className={
              "overflow-hidden rounded-lg border text-left transition-colors " +
              (active ? "border-acid-lime" : "border-graphite hover:border-smoke")
            }
          >
            <div className="px-2.5 py-2 font-mono text-[10.5px] leading-tight" style={{ background: t.bg, color: t.fg }}>
              <div>user@host:~$</div>
              <div>▮ ls -la</div>
            </div>
            <div className="border-t border-graphite/60 px-2.5 py-1.5 text-[11.5px] text-mist">{t.name}</div>
          </button>
        );
      })}
    </div>
  );
}

function FontGrid({ fonts, value, onChange }) {
  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
      {fonts.map((f) => {
        const active = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-pressed={active}
            className={
              "rounded-lg border px-3 py-2.5 text-left transition-colors " +
              (active ? "border-acid-lime bg-acid-lime/[0.06]" : "border-graphite hover:border-smoke")
            }
          >
            <div className="text-[15px] text-mist" style={{ fontFamily: f.stack }}>$ npm run dev</div>
            <div className="mt-1 text-[11px] text-fog">{f.name}</div>
          </button>
        );
      })}
    </div>
  );
}

function LivePreview({ theme, font, size }) {
  const t = INV.THEMES.find((x) => x.id === theme) ?? INV.THEMES[0];
  const f = INV.FONTS.find((x) => x.id === font) ?? INV.FONTS[0];
  return (
    <div className="rounded-lg border border-graphite overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-graphite/70 bg-carbon px-2.5 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-coral-red/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-pulse-green/70" />
        <span className="ml-2 text-[11px] text-fog">Preview · {t.name}</span>
      </div>
      <div className="px-3 py-2.5" style={{ background: t.bg, color: t.fg, fontFamily: f.stack, fontSize: size + "px", lineHeight: 1.45 }}>
        <div>Last login: Fri Jul 25 09:14:02 2026</div>
        <div><span style={{ color: t.fg }}>ubuntu@web-prod-01</span>:~$ ./deploy.sh</div>
        <div>✓ build complete · 12.4s</div>
        <div>✓ 3 containers healthy</div>
        <div>ubuntu@web-prod-01:~$ <span className="cursor-blink inline-block w-[7px]" style={{ height: size - 2, background: t.fg }} /></div>
      </div>
    </div>
  );
}

function NumberField({ label, value, suffix, onChange, min, max }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px] text-mist">{label}</span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-carbon px-2 py-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-[68px] bg-transparent text-right text-[12.5px] text-mist outline-none"
        />
        {suffix ? <span className="text-[11px] text-fog">{suffix}</span> : null}
      </span>
    </label>
  );
}

function TerminalSection({ theme, setTheme, font, setFont, fontSize, setFontSize }) {
  const [paste, setPaste] = useState(true);
  const [bell, setBell] = useState(false);
  const [meta, setMeta] = useState(true);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-4">
        <Card>
          <PrefHeader icon="sliders" title="Behavior" subtitle="Input handling for every terminal session" />
          <div className="divide-y divide-graphite/60">
            <Toggle on={paste} onChange={setPaste} label="Right-click paste" hint="Paste from clipboard on secondary click" />
            <Toggle on={bell} onChange={setBell} label="Terminal bell" hint="Beep and flash on BEL — useful when a long job finishes" />
            <Toggle on={meta} onChange={setMeta} label="Use Option key as Meta" hint="Send ESC-prefixed sequences (emacs, bash word-jump)" />
          </div>
        </Card>

        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="m-0 text-[13px] font-semibold tracking-tight text-paper">Theme</h3>
            <span className="text-[11.5px] text-fog">Preview foreground & background</span>
          </div>
          <ThemeGrid themes={INV.THEMES} value={theme} onChange={setTheme} />
        </Card>

        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="m-0 text-[13px] font-semibold tracking-tight text-paper">Font</h3>
            <span className="text-[11.5px] text-fog">Missing fonts fall back to a system monospace</span>
          </div>
          <FontGrid fonts={INV.FONTS} value={font} onChange={setFont} />
        </Card>

        <Card>
          <PrefHeader icon="sliders" title="Session" />
          <div className="divide-y divide-graphite/60">
            <NumberField label="Font size" value={fontSize} suffix="px" min={9} max={28} onChange={setFontSize} />
            <NumberField label="SSH keepalive interval" value={30} suffix="s" min={0} max={600} onChange={() => {}} />
            <NumberField label="Scrollback lines" value={10000} suffix="lines" min={100} max={100000} onChange={() => {}} />
          </div>
          <label className="flex items-center justify-between gap-4 border-t border-graphite/60 py-2">
            <span className="text-[13px] text-mist">Local terminal shell</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-carbon px-2 py-1 font-mono text-[12px] text-mist">
              <Icon name="terminal" size={12} className="text-fog" />
              /bin/zsh
            </span>
          </label>
        </Card>
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-0">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">Live preview</h3>
          <LivePreview theme={theme} font={font} size={fontSize} />
        </div>
      </div>
    </div>
  );
}

/* ---- SFTP section --------------------------------------------------- */

function SftpSection() {
  const { FILE_ASSOCIATIONS } = INV;
  const [items, setItems] = useState(FILE_ASSOCIATIONS);
  return (
    <div className="grid gap-4">
      <Card>
        <PrefHeader icon="folder" title="Open With" subtitle="Open remote files with a local app after downloading" />
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-graphite bg-carbon text-fog">
              <Icon name="folder-open" size={20} />
            </span>
            <p className="m-0 mt-2 text-[13px] text-mist">No file type associations yet</p>
            <p className="m-0 mt-1 max-w-[280px] text-[12px] text-fog">
              Use “Open With…” in the SFTP file list to associate an extension with a local application.
            </p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            {items.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-graphite/70 bg-carbon/50 px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-mist">
                  <Icon name={a.icon} size={14} />
                </span>
                <span className="font-mono text-[13px] text-mist">{a.ext}</span>
                <Icon name="chevron-right" size={13} className="text-fog/50" />
                <span className="text-[13px] text-fog">opens in {a.app}</span>
                <button
                  type="button"
                  aria-label={"Remove " + a.ext}
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== a.id))}
                  className="ml-auto grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---- Shortcuts section ---------------------------------------------- */

function ShortcutsSection() {
  const groups = {};
  for (const s of INV.SHORTCUTS) (groups[s.group] ||= []).push(s);
  return (
    <div className="grid gap-4">
      <Card>
        <PrefHeader icon="command" title="Keyboard shortcuts" subtitle="macOS mapping · Windows and Linux use equivalent platform modifiers" />
        <div className="grid gap-5 md:grid-cols-2">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">{g}</h3>
              <div className="divide-y divide-graphite/50 rounded-lg border border-graphite/60">
                {list.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-[12.5px] text-mist">{s.action}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, i) => (i === s.keys.length - 1 ? <Kbd key={i}>{k}</Kbd> : <span key={i} className="flex items-center gap-1"><Kbd>{k}</Kbd><span className="text-fog/50">+</span></span>))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---- Known Hosts section -------------------------------------------- */

function KnownHostsSection() {
  const { KNOWN_HOSTS } = INV;
  const [items, setItems] = useState(KNOWN_HOSTS);
  return (
    <div className="grid gap-4">
      <Card>
        <PrefHeader icon="shield-check" title="Known hosts" subtitle="Trusted host keys. A mismatch blocks the connection until you decide." />
        <div className="grid gap-1.5">
          {items.map((k) => (
            <div key={k.id} className={"flex items-center gap-3 rounded-lg border px-3 py-2.5 " + (k.mismatch ? "border-coral-red/40 bg-coral-red/[0.05]" : "border-graphite/70 bg-carbon/50")}>
              <Icon name={k.mismatch ? "alert-circle" : "shield-check"} size={16} className={k.mismatch ? "text-coral-red" : "text-pulse-green"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-mist">{k.host}</span>
                  <span className="font-mono text-[11px] text-fog">{k.address}</span>
                  <span className="rounded-pill bg-graphite/60 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.04em] text-fog">{k.type}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fog">{k.fingerprint}</div>
              </div>
              {k.mismatch ? (
                <span className="inline-flex items-center gap-1 rounded-pill bg-coral-red/12 px-2 py-0.5 text-[11px] text-coral-red">
                  <Icon name="alert" size={11} />Key mismatch
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[11px] text-pulse-green">
                  <Icon name="check" size={11} />Trusted
                </span>
              )}
              <button type="button" aria-label={"Remove " + k.host} onClick={() => setItems((p) => p.filter((x) => x.id !== k.id))} className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red">
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          {items.length === 0 ? <p className="m-0 px-2 py-6 text-center text-[12.5px] text-fog">No known hosts recorded.</p> : null}
        </div>
      </Card>
    </div>
  );
}

/* ---- Keychain section ----------------------------------------------- */

function KeychainSection() {
  const { IDENTITIES } = INV;
  return (
    <div className="grid gap-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <PrefHeader icon="key" title="Keys & identities" subtitle="Encrypted at rest in the local vault — never leaves the device in plaintext" />
          <div className="flex items-center gap-1.5">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:bg-white/5">
              <Icon name="upload" size={13} />Import
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-2.5 py-1.5 text-[12px] font-semibold text-void transition hover:brightness-105">
              <Icon name="plus" size={13} />Generate
            </button>
          </div>
        </div>
        <div className="grid gap-1.5">
          {IDENTITIES.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border border-graphite/70 bg-carbon/50 px-3 py-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-graphite text-mist">
                <Icon name={k.type === "SSH certificate" ? "shield-check" : "key"} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-mist">{k.name}</span>
                  <span className="rounded-pill bg-graphite/60 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.04em] text-fog">{k.algorithm}</span>
                  {k.passphrase ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-fog" title="Passphrase-protected">
                      <Icon name="lock" size={10} />
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fog">{k.fingerprint}</div>
              </div>
              <div className="hidden shrink-0 items-center gap-1 text-[11.5px] text-fog sm:flex">
                <Icon name="server" size={11} />
                {k.attached} host{k.attached === 1 ? "" : "s"}
              </div>
              {k.expires ? (
                <span className="shrink-0 rounded-pill bg-yellow-500/12 px-2 py-0.5 text-[11px] text-yellow-400">expires {k.expires}</span>
              ) : null}
              <button type="button" aria-label={"Export " + k.name} className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist">
                <Icon name="download" size={14} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <PrefHeader icon="fingerprint" title="FIDO2 / security keys" subtitle="Bind a hardware authenticator (YubiKey, etc.) to an SSH key for phishing-resistant login" />
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-graphite bg-carbon/40 px-3 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-graphite text-acid-lime">
            <Icon name="fingerprint" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-mist">No security key bound</div>
            <div className="mt-0.5 text-[11.5px] text-fog">Touch your authenticator to register an ed25519-sk credential.</div>
          </div>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:bg-white/5">
            <Icon name="plus" size={13} />Set up
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---- AI providers section ------------------------------------------- */

// Provider "kind" folds the spec's adapter + preset into the choice users
// actually make ("add my OpenAI key", "add a Kimi endpoint", "use local Ollama").
const AI_KINDS = [
  { id: "anthropic", label: "Anthropic", adapter: "AnthropicAdapter", baseUrl: "https://api.anthropic.com", icon: "cloud", tint: "text-lavender", chip: "bg-iris-violet/12 text-lavender", needsKey: true },
  { id: "openai", label: "OpenAI", adapter: "OpenAiCompatibleAdapter", baseUrl: "https://api.openai.com/v1", icon: "cloud", tint: "text-signal-teal", chip: "bg-signal-teal/12 text-signal-teal", needsKey: true },
  { id: "glm", label: "GLM (Zhipu)", adapter: "OpenAiCompatibleAdapter", baseUrl: "https://open.bigmodel.cn/api/paas/v4", icon: "cloud", tint: "text-signal-teal", chip: "bg-signal-teal/12 text-signal-teal", needsKey: true },
  { id: "kimi", label: "Kimi (Moonshot)", adapter: "OpenAiCompatibleAdapter", baseUrl: "https://api.moonshot.cn/v1", icon: "cloud", tint: "text-signal-teal", chip: "bg-signal-teal/12 text-signal-teal", needsKey: true },
  { id: "deepseek", label: "DeepSeek", adapter: "OpenAiCompatibleAdapter", baseUrl: "https://api.deepseek.com/v1", icon: "cloud", tint: "text-signal-teal", chip: "bg-signal-teal/12 text-signal-teal", needsKey: true },
  { id: "custom", label: "Custom OpenAI-compatible", adapter: "OpenAiCompatibleAdapter", baseUrl: "", icon: "cloud", tint: "text-signal-teal", chip: "bg-signal-teal/12 text-signal-teal", needsKey: true },
  { id: "ollama", label: "Ollama (local)", adapter: "OllamaAdapter", baseUrl: "http://localhost:11434", icon: "hard-drive", tint: "text-acid-lime", chip: "bg-acid-lime/12 text-acid-lime", needsKey: false },
];

const AI_PROVIDERS = [
  { id: "ai-claude", name: "Claude Sonnet 5", kind: "anthropic", baseUrl: "https://api.anthropic.com", modelId: "claude-sonnet-5", apiKey: "sk-ant-api03-········EVPN", status: "connected", latencyMs: 412, at: "2 min ago" },
  { id: "ai-openai", name: "GPT-4o", kind: "openai", baseUrl: "https://api.openai.com/v1", modelId: "gpt-4o", apiKey: "sk-proj-········X7K2", status: "connected", latencyMs: 689, at: "5 min ago" },
  { id: "ai-deepseek", name: "DeepSeek V3", kind: "deepseek", baseUrl: "https://api.deepseek.com/v1", modelId: "deepseek-chat", apiKey: "sk-deepseek-········9MQA", status: "connected", latencyMs: 1024, at: "12 min ago" },
  { id: "ai-kimi", name: "Kimi K2", kind: "kimi", baseUrl: "https://api.moonshot.cn/v1", modelId: "kimi-k2", apiKey: "sk-moonshot-········H4ZR", status: "failed", error: "401 Unauthorized — bad API key", at: "1 hr ago" },
  { id: "ai-ollama", name: "Llama 3.1 (local)", kind: "ollama", baseUrl: "http://localhost:11434", modelId: "llama3.1:70b", apiKey: null, status: "connected", latencyMs: 53, at: "just now" },
];

function kindById(id) {
  return AI_KINDS.find((k) => k.id === id) ?? AI_KINDS[0];
}

// Mask a pasted/typed API key for display in the provider row.
// Keeps a short prefix hint + the last 4 chars; collapses the middle into dots.
function maskApiKey(raw) {
  const key = (raw || "").trim();
  if (!key) return "";
  if (key.length <= 8) return "········";
  const head = key.slice(0, key.indexOf("-") + 1 || 0); // e.g. "sk-ant-api03-"
  const tail = key.slice(-4);
  return (head || key.slice(0, 3)) + "········" + tail;
}

function AiStatusPill({ provider }) {
  if (provider.status === "connected")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[10.5px] font-medium text-pulse-green">
        <Icon name="check" size={10} /> Connected · {provider.latencyMs} ms
      </span>
    );
  if (provider.status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10.5px] font-medium text-coral-red" title={provider.error}>
        <Icon name="alert" size={10} /> Failed
      </span>
    );
  if (provider.status === "testing")
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-yellow-400/12 px-2 py-0.5 text-[10.5px] font-medium text-yellow-400">
        <Icon name="refresh" size={10} className="spin" /> Testing…
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-graphite/60 px-2 py-0.5 text-[10.5px] text-fog">
      <Icon name="clock" size={10} /> Untested
    </span>
  );
}

function AiProviderRow({ provider, onEdit, onTest, onDelete }) {
  const kind = kindById(provider.kind);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-graphite/70 bg-carbon/50 px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-graphite text-mist">
        <Icon name={kind.icon} size={15} className={kind.tint} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] text-mist">{provider.name}</span>
          <span className={"shrink-0 rounded-pill px-1.5 py-0.5 text-[10.5px] font-medium " + kind.chip}>{kind.label}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-fog">
          <span className="truncate">{provider.modelId}</span>
          <span className="text-fog/40">·</span>
          <span className="inline-flex items-center gap-1 truncate">
            <Icon name="key" size={9} className={provider.apiKey ? "text-acid-lime/70" : "text-fog/40"} />
            {provider.apiKey ?? "no key · local"}
          </span>
        </div>
      </div>
      <AiStatusPill provider={provider} />
      <button
        type="button"
        aria-label={"Test " + provider.name}
        onClick={() => onTest(provider.id)}
        disabled={provider.status === "testing"}
        className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist disabled:opacity-60"
        title="Test connection"
      >
        <Icon name="refresh" size={13} className={provider.status === "testing" ? "spin" : ""} />
      </button>
      <button
        type="button"
        aria-label={"Edit " + provider.name}
        onClick={() => onEdit(provider)}
        className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
      >
        <Icon name="edit" size={13} />
      </button>
      <button
        type="button"
        aria-label={"Remove " + provider.name}
        onClick={() => onDelete(provider.id)}
        className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}

function AiProviderForm({ initial, onSave, onCancel }) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [kindId, setKindId] = useState(initial?.kind ?? "anthropic");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? AI_KINDS[0].baseUrl);
  const [modelId, setModelId] = useState(initial?.modelId ?? "");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState(null); // null | "testing" | { status, latencyMs?, error? }

  const kind = kindById(kindId);

  const onPickKind = (id) => {
    const next = kindById(id);
    setKindId(id);
    // Auto-fill endpoint when the user changes kind; clear the key for re-entry.
    setBaseUrl(next.baseUrl);
    setApiKey("");
    setShowKey(false);
    setTest(null);
  };

  const runTest = () => {
    setTest("testing");
    setTimeout(() => {
      // Deterministic fake result for the prototype: Kimi fails, others connect.
      const fail = kindId === "kimi" && isNew;
      setTest(
        fail
          ? { status: "failed", error: "401 Unauthorized — bad API key" }
          : { status: "connected", latencyMs: 380 + Math.floor((modelId.length || 8) * 17) },
      );
    }, 1200);
  };

  const submit = (e) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? "ai-" + Date.now().toString(36),
      name: name.trim() || (isNew ? kind.label + " provider" : "Untitled"),
      kind: kindId,
      baseUrl: baseUrl.trim(),
      modelId: modelId.trim() || "model-id",
      apiKey: kind.needsKey ? maskApiKey(apiKey) || initial?.apiKey : null,
      status: test && test.status === "connected" ? "connected" : test && test.status === "failed" ? "failed" : initial?.status ?? "untested",
      latencyMs: test && test.status === "connected" ? test.latencyMs : initial?.latencyMs,
      error: test && test.status === "failed" ? test.error : initial?.error,
      at: test ? "just now" : initial?.at ?? "never",
    });
  };

  const FIELD_CLS =
    "w-full rounded-md border border-graphite bg-carbon px-2.5 py-1.5 text-[12.5px] text-mist outline-none transition-colors focus:border-acid-lime/60";
  const LABEL_CLS = "block text-[11px] font-semibold uppercase tracking-[0.06em] text-fog/70";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 p-4 backdrop-blur-sm" onMouseDown={onCancel}>
      <form
        onSubmit={submit}
        className="pop-in flex w-[min(480px,94vw)] flex-col overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_30px_90px_rgb(0_0_0/0.65)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-graphite px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-acid-lime">
              <Icon name="sparkles" size={15} />
            </span>
            <h2 className="m-0 text-[14px] font-semibold tracking-tight text-paper">
              {isNew ? "Add AI provider" : "Edit AI provider"}
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="scroll-thin grid max-h-[70vh] gap-3.5 overflow-y-auto px-5 py-4">
          <label className="grid gap-1">
            <span className={LABEL_CLS}>Display name</span>
            <input className={FIELD_CLS} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Sonnet 5" autoFocus />
          </label>

          <label className="grid gap-1">
            <span className={LABEL_CLS}>Provider type</span>
            <select className={FIELD_CLS} value={kindId} onChange={(e) => onPickKind(e.target.value)}>
              {AI_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} {k.id === "custom" || k.id === "ollama" ? "" : "· " + k.adapter}
                </option>
              ))}
            </select>
            <span className="mt-0.5 text-[11px] text-fog/70">
              <Icon name="cloud" size={10} className="mr-1 align-middle text-fog/60" />
              {kind.adapter} transport
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={LABEL_CLS}>Base URL</span>
              <input className={FIELD_CLS + " font-mono"} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="grid gap-1">
              <span className={LABEL_CLS}>Model ID</span>
              <input className={FIELD_CLS + " font-mono"} value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="e.g. claude-sonnet-5" />
            </label>
          </div>

          {kind.needsKey ? (
            <label className="grid gap-1">
              <span className={LABEL_CLS}>API key</span>
              <span className="flex items-stretch overflow-hidden rounded-md border border-graphite bg-carbon focus-within:border-acid-lime/60">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your API key"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-mist outline-none placeholder:text-fog/50"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  title={showKey ? "Hide" : "Show"}
                  className="grid w-9 shrink-0 place-items-center text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Icon name={showKey ? "lock" : "shield"} size={13} />
                </button>
              </span>
              <span className="mt-0.5 text-[11px] leading-relaxed text-fog/70">
                Saved as plain form data alongside the provider config.
              </span>
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-graphite bg-carbon/40 px-3 py-2 text-[11.5px] text-fog">
              <Icon name="shield-check" size={12} className="text-acid-lime" />
              Local runtime — no API key required.
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-graphite/60 pt-3">
            <button
              type="button"
              onClick={runTest}
              disabled={test === "testing"}
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:bg-white/5 disabled:opacity-60"
            >
              <Icon name="refresh" size={12} className={test === "testing" ? "spin" : ""} />
              {test === "testing" ? "Testing…" : "Test connection"}
            </button>
            {test === "testing" ? (
              <span className="text-[11.5px] text-fog">Connecting and probing endpoint…</span>
            ) : test && test.status === "connected" ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-pulse-green">
                <Icon name="check" size={11} /> Connected · {test.latencyMs} ms
              </span>
            ) : test && test.status === "failed" ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-coral-red" title={test.error}>
                <Icon name="alert" size={11} /> {test.error}
              </span>
            ) : (
              <span className="text-[11.5px] text-fog/60">Verify the endpoint and API key before saving.</span>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-graphite bg-obsidian/40 px-5 py-3">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
            Cancel
          </button>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3 py-1.5 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105">
            <Icon name="check" size={13} />
            Save provider
          </button>
        </footer>
      </form>
    </div>
  );
}

function AiProvidersSection() {
  const [providers, setProviders] = useState(AI_PROVIDERS);
  const [editing, setEditing] = useState(null); // null | { isNew: bool, initial?: obj }

  const handleTest = (id) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, status: "testing" } : p)));
    setTimeout(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === id
            ? p.status === "failed"
              ? { ...p, status: "failed" }
              : { ...p, status: "connected", latencyMs: 380 + Math.floor((p.modelId.length || 8) * 17), at: "just now" }
            : p,
        ),
      );
    }, 1200);
  };

  const handleDelete = (id) => setProviders((prev) => prev.filter((p) => p.id !== id));

  const handleSave = (draft) => {
    setProviders((prev) => (prev.some((p) => p.id === draft.id) ? prev.map((p) => (p.id === draft.id ? draft : p)) : [...prev, draft]));
    setEditing(null);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <PrefHeader icon="sparkles" title="AI providers" subtitle="Configure one or more model providers · API key saved with the provider config" />
          <button
            type="button"
            onClick={() => setEditing({ isNew: true })}
            className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-2.5 py-1.5 text-[12px] font-semibold text-void transition hover:brightness-105"
          >
            <Icon name="plus" size={13} />Add provider
          </button>
        </div>
        <div className="grid gap-1.5">
          {providers.map((p) => (
            <AiProviderRow
              key={p.id}
              provider={p}
              onEdit={(prov) => setEditing({ isNew: false, initial: prov })}
              onTest={handleTest}
              onDelete={handleDelete}
            />
          ))}
          {providers.length === 0 ? (
            <p className="m-0 px-2 py-6 text-center text-[12.5px] text-fog">No AI providers configured yet.</p>
          ) : null}
        </div>
      </Card>

      {editing ? (
        <AiProviderForm
          initial={editing.isNew ? null : editing.initial}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/* ---- Shell ---------------------------------------------------------- */

function PreferencesWindow({ open, onClose, theme, setTheme, font, setFont, fontSize, setFontSize }) {
  const [section, setSection] = useState("terminal");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-void/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="pop-in flex h-[min(640px,92vh)] w-[min(900px,94vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_30px_90px_rgb(0_0_0/0.65)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Rail */}
        <nav className="flex w-[190px] shrink-0 flex-col border-r border-graphite bg-obsidian/50 px-2.5 py-3" aria-label="Preferences sections">
          <div className="flex h-[26px] gap-2 px-1 pb-3">
            <span className="h-3 w-3 rounded-full bg-coral-red/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
            <span className="h-3 w-3 rounded-full bg-pulse-green/80" />
          </div>
          <div className="grid gap-1">
            {PREF_SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors " +
                    (active ? "bg-graphite text-paper" : "text-fog hover:bg-white/5 hover:text-mist")
                  }
                >
                  <Icon name={s.icon} size={15} />
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto px-2.5 pt-3 text-[11px] leading-relaxed text-fog/70">
            <div className="flex items-center gap-1.5 text-fog">
              <Icon name="bookmark" size={11} />
              Changelog
            </div>
            <p className="m-0 mt-1">Buzz 0.1.0 (dev) · Electron/xterm build</p>
          </div>
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-graphite px-5 py-3">
            <h1 className="m-0 text-[14px] font-semibold tracking-tight text-paper">Preferences</h1>
            <button type="button" aria-label="Close preferences" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist">
              <Icon name="x" size={16} />
            </button>
          </header>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {section === "terminal" ? (
              <TerminalSection theme={theme} setTheme={setTheme} font={font} setFont={setFont} fontSize={fontSize} setFontSize={setFontSize} />
            ) : section === "sftp" ? (
              <SftpSection />
            ) : section === "shortcuts" ? (
              <ShortcutsSection />
            ) : section === "known" ? (
              <KnownHostsSection />
            ) : section === "ai" ? (
              <AiProvidersSection />
            ) : (
              <KeychainSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PreferencesWindow });
