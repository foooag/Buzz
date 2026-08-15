import { useEffect, useState } from "react";
import {
  Bookmark,
  Check,
  CircleAlert,
  Command,
  FolderOpen,
  Languages,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  PREF_FONTS,
  PREF_SHORTCUTS,
  PREF_THEMES,
} from "./prototypeData";
import { CredentialsSection } from "./CredentialsSection";
import type { InventoryApi } from "../inventory/inventoryApi";
import { useI18n, type Locale } from "../../shared/i18n";
import {
  defaultTerminalPreferences,
  type TerminalPreferences,
} from "./terminalPreferences";
import type { SftpApi } from "../sftp/sftpApi";
import type { KnownHostRecord, SshApi } from "../ssh/sshApi";
import type { Association } from "../sftp/sftpTypes";
import { SftpSettings } from "./SftpSettings";
import type { AiConfigApi } from "../ai/aiConfigTypes";
import { AiProvidersSection } from "../ai/AiProvidersSection";
import {
  windowControlsApi,
  type WindowControlsApi,
} from "./windowControlsApi";
import { UpdateDialog } from "../updater/UpdateDialog";
import type {
  AvailableUpdate,
  UpdaterApi,
} from "../updater/updaterApi";

const PREF_SECTIONS = [
  { id: "language", label: "Language", Icon: Languages },
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "sftp", label: "SFTP", Icon: FolderOpen },
  { id: "shortcuts", label: "Shortcuts", Icon: Command },
  { id: "known", label: "Known Hosts", Icon: ShieldCheck },
  { id: "credentials", label: "Credentials", Icon: KeyRound },
  { id: "ai", label: "AI Providers", Icon: Sparkles },
] as const;

export type SectionId = (typeof PREF_SECTIONS)[number]["id"];

function LanguageSection() {
  const { locale, setLocale } = useI18n();
  return (
    <Card>
      <PrefHeader icon={Languages} title="Language" subtitle="Interface language" />
      <label className="flex items-center justify-between gap-4 py-2">
        <span className="text-[13px] text-mist">Interface language</span>
        <select
          aria-label="Interface language"
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
          className="rounded-md border border-graphite bg-carbon px-3 py-1.5 text-[12.5px] text-mist outline-hidden"
        >
          <option value="zh-CN">Chinese</option>
          <option value="en">English</option>
        </select>
      </label>
    </Card>
  );
}

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
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
        className={`relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors ${on ? "bg-acid-lime/80" : "bg-smoke"}`}
      >
        <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-paper transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
      </button>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-graphite/70 bg-obsidian/30 p-4">{children}</div>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-graphite bg-carbon px-1.5 py-0.5 font-sans text-[11px] text-mist">{children}</kbd>
  );
}

function PrefHeader({ icon: Icon, title, subtitle }: { icon: typeof Terminal; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-graphite text-mist">
        <Icon size={16} />
      </span>
      <div>
        <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">{title}</h2>
        <p className="m-0 mt-0.5 text-[12px] text-fog">{subtitle}</p>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px] text-mist">{label}</span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-carbon px-2 py-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (!Number.isFinite(next)) return;
            onChange(Math.min(max ?? next, Math.max(min ?? next, next)));
          }}
          className="w-[68px] bg-transparent text-right text-[12.5px] text-mist outline-hidden"
        />
        {suffix ? <span className="text-[11px] text-fog">{suffix}</span> : null}
      </span>
    </label>
  );
}

function TerminalSection({
  theme,
  setTheme,
  preferences,
  onPreferencesChange,
}: {
  theme: string;
  setTheme: (value: string) => void;
  preferences: TerminalPreferences;
  onPreferencesChange: (value: TerminalPreferences) => void;
}) {
  const update = (patch: Partial<TerminalPreferences>) =>
    onPreferencesChange({ ...preferences, ...patch });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-4">
        <Card>
          <PrefHeader icon={SlidersHorizontal} title="Behavior" subtitle="Input handling for every terminal session" />
          <div className="divide-y divide-graphite/60">
            <Toggle on={preferences.rightClickPaste} onChange={(value) => update({ rightClickPaste: value })} label="Right-click paste" hint="Paste from clipboard on secondary click" />
            <Toggle on={preferences.terminalBell} onChange={(value) => update({ terminalBell: value })} label="Terminal bell" hint="Flash on BEL — useful when a long job finishes" />
            <Toggle on={preferences.optionAsMeta} onChange={(value) => update({ optionAsMeta: value })} label="Use Option key as Meta" hint="Send ESC-prefixed sequences (emacs, bash word-jump)" />
          </div>
        </Card>

        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="m-0 text-[13px] font-semibold tracking-tight text-paper">Theme</h3>
            <span className="text-[11.5px] text-fog">Preview foreground &amp; background</span>
          </div>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
            {PREF_THEMES.map((t) => {
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  aria-pressed={active}
                  className={`overflow-hidden rounded-lg border text-left transition-colors ${active ? "border-acid-lime" : "border-graphite hover:border-smoke"}`}
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
        </Card>

        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="m-0 text-[13px] font-semibold tracking-tight text-paper">Font</h3>
            <span className="text-[11.5px] text-fog">Missing fonts fall back to a system monospace</span>
          </div>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {PREF_FONTS.map((f) => {
              const active = f.id === preferences.fontId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => update({ fontId: f.id })}
                  aria-pressed={active}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? "border-acid-lime bg-acid-lime/6" : "border-graphite hover:border-smoke"}`}
                >
                  <div className="text-[15px] text-mist" style={{ fontFamily: f.stack }}>$ npm run dev</div>
                  <div className="mt-1 text-[11px] text-fog">{f.name}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <PrefHeader icon={SlidersHorizontal} title="Session" />
          <div className="divide-y divide-graphite/60">
            <NumberField label="Font size" value={preferences.fontSize} suffix="px" min={9} max={28} onChange={(value) => update({ fontSize: value })} />
            <NumberField label="SSH keepalive interval" value={preferences.keepaliveInterval} suffix="s" min={0} max={600} onChange={(value) => update({ keepaliveInterval: value })} />
            <NumberField label="Scrollback lines" value={preferences.scrollbackLines} suffix="lines" min={100} max={100000} onChange={(value) => update({ scrollbackLines: value })} />
          </div>
          <label className="flex items-center justify-between gap-4 border-t border-graphite/60 py-2">
            <span className="text-[13px] text-mist">Local terminal shell</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-carbon px-2 py-1 font-mono text-[12px] text-mist">
              <Terminal size={12} className="text-fog" />
              System default
            </span>
          </label>
        </Card>
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-0">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">Live preview</h3>
          <LivePreview theme={theme} font={preferences.fontId} size={preferences.fontSize} />
        </div>
      </div>
    </div>
  );
}

function LivePreview({ theme, font, size }: { theme: string; font: string; size: number }) {
  const t = PREF_THEMES.find((x) => x.id === theme) ?? PREF_THEMES[0];
  const f = PREF_FONTS.find((x) => x.id === font) ?? PREF_FONTS[0];
  return (
    <div className="overflow-hidden rounded-lg border border-graphite">
      <div className="flex items-center gap-1.5 border-b border-graphite/70 bg-carbon px-2.5 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-coral-red/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-pulse-green/70" />
        <span className="ml-2 text-[11px] text-fog">Preview · {t.name}</span>
      </div>
      <div className="px-3 py-2.5" style={{ background: t.bg, color: t.fg, fontFamily: f.stack, fontSize: `${size}px`, lineHeight: 1.45 }}>
        <div>Last login: Fri Jul 25 09:14:02 2026</div>
        <div>ubuntu@web-prod-01:~$ ./deploy.sh</div>
        <div>✓ build complete · 12.4s</div>
        <div>✓ 3 containers healthy</div>
        <div>
          ubuntu@web-prod-01:~$ <span className="cursor-blink inline-block w-[7px]" style={{ height: size - 2, background: t.fg }} />
        </div>
      </div>
    </div>
  );
}

function SftpSection({ api }: { api?: SftpApi }) {
  const [items, setItems] = useState<Association[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api
      .listAssociations()
      .then((associations) => {
        if (active) setItems(associations);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const remove = async (extension: string) => {
    if (!api) return;
    try {
      await api.deleteAssociation(extension);
      setItems((current) =>
        current.filter((item) => item.extension !== extension),
      );
      setError(false);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <PrefHeader icon={FolderOpen} title="Open With" subtitle="Open remote files with a local app after downloading" />
        {error ? (
          <p role="alert" className="text-[12.5px] text-coral-red">
            File associations could not be loaded or updated.
          </p>
        ) : null}
        <SftpSettings associations={items} onDelete={(extension) => void remove(extension)} />
      </Card>
    </div>
  );
}

function ShortcutsSection() {
  const groups: Record<string, typeof PREF_SHORTCUTS> = {};
  for (const s of PREF_SHORTCUTS) (groups[s.group] ??= []).push(s);
  return (
    <div className="grid gap-4">
      <Card>
        <PrefHeader icon={Command} title="Keyboard shortcuts" subtitle="macOS mapping · Windows and Linux use equivalent platform modifiers" />
        <div className="grid gap-5 md:grid-cols-2">
          {Object.entries(groups).map(([group, list]) => (
            <div key={group}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fog/70">{group}</h3>
              <div className="divide-y divide-graphite/50 rounded-lg border border-graphite/60">
                {list.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-[12.5px] text-mist">{s.action}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, i) =>
                        i === s.keys.length - 1 ? (
                          <Kbd key={i}>{k}</Kbd>
                        ) : (
                          <span key={i} className="flex items-center gap-1">
                            <Kbd>{k}</Kbd>
                            <span className="text-fog/50">+</span>
                          </span>
                        ),
                      )}
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

function KnownHostsSection({ api }: { api?: SshApi }) {
  const [items, setItems] = useState<KnownHostRecord[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api
      .listKnownHosts()
      .then((records) => {
        if (active) setItems(records);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const remove = async (record: KnownHostRecord) => {
    if (!api) return;
    try {
      await api.deleteKnownHost(record.hostname, record.port);
      setItems((current) =>
        current.filter(
          (item) =>
            item.hostname !== record.hostname || item.port !== record.port,
        ),
      );
      setPendingDelete(null);
      setError(false);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <PrefHeader icon={ShieldCheck} title="Known hosts" subtitle="Trusted host keys. A mismatch blocks the connection until you decide." />
        <div className="grid gap-1.5">
          {error ? (
            <p role="alert" className="text-[12.5px] text-coral-red">
              Trusted hosts could not be loaded or updated.
            </p>
          ) : null}
          {items.map((k) => {
            const key = `${k.hostname}:${k.port}`;
            return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg border border-graphite/70 bg-carbon/50 px-3 py-2.5"
            >
              <ShieldCheck size={16} className="text-pulse-green" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-mist">{k.hostname}</span>
                  <span className="font-mono text-[11px] text-fog">:{k.port}</span>
                  <span className="rounded-pill bg-graphite/60 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.04em] text-fog">{k.algorithm}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fog">{k.fingerprint}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[11px] text-pulse-green">
                <Check size={11} />
                Trusted
              </span>
              {pendingDelete === key ? (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => void remove(k)} className="text-[11.5px] text-coral-red">
                    Confirm
                  </button>
                  <button type="button" onClick={() => setPendingDelete(null)} className="text-[11.5px] text-fog">
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${k.hostname}:${k.port}`}
                  onClick={() => setPendingDelete(key)}
                  className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )})}
          {items.length === 0 ? <p className="m-0 px-2 py-6 text-center text-[12.5px] text-fog">No known hosts recorded.</p> : null}
        </div>
      </Card>
    </div>
  );
}

type UpdateCheckState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "latest" }
  | { phase: "error" }
  | { phase: "found"; update: AvailableUpdate };

function ChangelogSection({ updater }: { updater: UpdaterApi }) {
  const { t } = useI18n();
  const [check, setCheck] = useState<UpdateCheckState>({ phase: "idle" });

  const runCheck = async () => {
    if (check.phase === "checking") return;
    setCheck({ phase: "checking" });
    try {
      const available = await updater.check();
      if (available) {
        setCheck({ phase: "found", update: available });
      } else {
        setCheck({ phase: "latest" });
      }
    } catch {
      setCheck({ phase: "error" });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-fog">
          <Bookmark size={11} />
          Changelog
        </div>
        {check.phase === "found" ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-acid-lime/12 px-2 py-0.5 text-[10.5px] text-acid-lime">
            {t(`Buzz ${check.update.version} is available`)}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={check.phase === "checking"}
            className="inline-flex items-center gap-1 rounded-md border border-graphite px-1.5 py-0.5 text-[10.5px] text-fog transition-colors hover:border-smoke hover:text-mist disabled:cursor-default disabled:opacity-70"
          >
            <RefreshCw
              size={10}
              className={check.phase === "checking" ? "animate-spin" : ""}
            />
            {check.phase === "checking"
              ? t("Checking…")
              : check.phase === "latest"
                ? t("Up to date")
                : check.phase === "error"
                  ? t("Check failed — try again")
                  : t("Check for updates")}
          </button>
        )}
      </div>
      {check.phase === "found" ? (
        <UpdateDialog api={updater} initialUpdate={check.update} />
      ) : null}
    </>
  );
}

export function PreferencesWindow({
  open,
  onClose,
  inventoryApi,
  terminalThemeId = "pro",
  onTerminalThemeChange = () => undefined,
  terminalPreferences = defaultTerminalPreferences,
  onTerminalPreferencesChange = () => undefined,
  sftpApi,
  sshApi,
  aiConfigApi,
  windowControls = windowControlsApi,
  updater,
  initialSection,
}: {
  open: boolean;
  onClose: () => void;
  inventoryApi: InventoryApi;
  terminalThemeId?: string;
  onTerminalThemeChange?: (value: string) => void;
  terminalPreferences?: TerminalPreferences;
  onPreferencesChange?: (value: TerminalPreferences) => void;
  onTerminalPreferencesChange?: (value: TerminalPreferences) => void;
  sftpApi?: SftpApi;
  sshApi?: SshApi;
  aiConfigApi?: AiConfigApi;
  windowControls?: WindowControlsApi;
  updater?: UpdaterApi;
  initialSection?: SectionId;
}) {
  const [section, setSection] = useState<SectionId>(initialSection ?? "language");

  useEffect(() => {
    if (open && initialSection) setSection(initialSection);
  }, [open, initialSection]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-void/70 p-4 backdrop-blur-xs"
      onMouseDown={onClose}
    >
      <div
        className="pop-in flex h-[min(640px,92vh)] w-[min(900px,94vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_30px_90px_rgb(0_0_0/0.65)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <nav className="flex w-[190px] shrink-0 flex-col border-r border-graphite bg-obsidian/50 px-2.5 py-3" aria-label="Preferences sections">
          <div className="flex h-[26px] gap-2 px-1 pb-3">
            <button
              type="button"
              aria-label="Close"
              title="Close preferences"
              onClick={onClose}
              className="grid h-3 w-3 place-items-center rounded-full bg-coral-red/80 transition-colors hover:bg-coral-red"
            />
            <button
              type="button"
              aria-label="Minimize"
              title="Minimize window"
              onClick={() => {
                void windowControls.minimize();
              }}
              className="grid h-3 w-3 place-items-center rounded-full bg-yellow-400/80 transition-colors hover:bg-yellow-400"
            />
            <button
              type="button"
              aria-label="Zoom"
              title="Toggle window zoom"
              onClick={() => {
                void windowControls.toggleMaximize();
              }}
              className="grid h-3 w-3 place-items-center rounded-full bg-pulse-green/80 transition-colors hover:bg-pulse-green"
            />
          </div>
          <div className="grid gap-1">
            {PREF_SECTIONS.map((s) => {
              const active = section === s.id;
              const Icon = s.Icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${active ? "bg-graphite text-paper" : "text-fog hover:bg-white/5 hover:text-mist"}`}
                >
                  <Icon size={15} />
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto px-2.5 pt-3 text-[11px] leading-relaxed text-fog/70">
            {updater ? <ChangelogSection updater={updater} /> : null}
            <p className="m-0 mt-1">Buzz 0.1.0 (dev) · Electron/xterm build</p>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-graphite px-5 py-3">
            <h1 className="m-0 text-[14px] font-semibold tracking-tight text-paper">Preferences</h1>
            <button
              type="button"
              aria-label="Close preferences"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <X size={16} />
            </button>
          </header>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {section === "language" ? (
              <LanguageSection />
            ) : section === "terminal" ? (
              <TerminalSection
                theme={`th-${terminalThemeId}`}
                setTheme={(value) =>
                  onTerminalThemeChange(value.replace(/^th-/, ""))
                }
                preferences={terminalPreferences}
                onPreferencesChange={onTerminalPreferencesChange}
              />
            ) : section === "sftp" ? (
              <SftpSection api={sftpApi} />
            ) : section === "shortcuts" ? (
              <ShortcutsSection />
            ) : section === "known" ? (
              <KnownHostsSection api={sshApi} />
            ) : section === "credentials" ? (
              <CredentialsSection api={inventoryApi} />
            ) : aiConfigApi ? (
              <AiProvidersSection api={aiConfigApi} />
            ) : (
              <div className="rounded-xl border border-graphite/70 bg-obsidian/30 p-4 text-[12.5px] text-fog">
                AI providers are unavailable.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
