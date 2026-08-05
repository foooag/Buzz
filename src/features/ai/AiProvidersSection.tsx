import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  Cloud,
  HardDrive,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { IpcCommandError } from "../../app/ipc";
import type {
  AiConfigApi,
  AiProviderConfig,
  ConnectionStatus,
  ProviderKind,
} from "./aiConfigTypes";

type ProviderPreset = {
  id: ProviderKind;
  label: string;
  providerLayer: string;
  baseUrl: string;
  icon: typeof Cloud;
  tint: string;
  chip: string;
  needsKey: boolean;
};

export const AI_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    providerLayer: "aimux AnthropicProvider",
    baseUrl: "https://api.anthropic.com",
    icon: Cloud,
    tint: "text-lavender",
    chip: "bg-iris-violet/12 text-lavender",
    needsKey: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    providerLayer: "aimux OpenAIProvider",
    baseUrl: "https://api.openai.com/v1",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    providerLayer: "aimux registry · zhipu_v4",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    providerLayer: "aimux registry · moonshotai",
    baseUrl: "https://api.moonshot.cn/v1",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    providerLayer: "aimux registry · deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "glmCodingPlan",
    label: "GLM Coding Plan (Zhipu)",
    providerLayer: "aimux OpenAIProvider",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "kimiCode",
    label: "Kimi Code (Moonshot)",
    providerLayer: "aimux OpenAIProvider",
    baseUrl: "https://api.kimi.com/coding/v1",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    providerLayer: "aimux OpenAIProvider",
    baseUrl: "",
    icon: Cloud,
    tint: "text-signal-teal",
    chip: "bg-signal-teal/12 text-signal-teal",
    needsKey: true,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    providerLayer: "aimux OllamaProvider",
    baseUrl: "http://127.0.0.1:11434/v1",
    icon: HardDrive,
    tint: "text-acid-lime",
    chip: "bg-acid-lime/12 text-acid-lime",
    needsKey: false,
  },
];

function presetById(id: ProviderKind): ProviderPreset {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? AI_PROVIDER_PRESETS[0];
}

function StatusPill({
  status,
  latencyMs,
  error,
}: {
  status: ConnectionStatus;
  latencyMs?: number;
  error?: string;
}) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[10.5px] font-medium text-pulse-green">
        <Check size={10} /> Connected{latencyMs === undefined ? "" : ` · ${latencyMs} ms`}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10.5px] font-medium text-coral-red"
        title={error}
      >
        <AlertTriangle size={10} /> Failed
      </span>
    );
  }
  if (status === "testing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-yellow-400/12 px-2 py-0.5 text-[10.5px] font-medium text-yellow-400">
        <RefreshCw size={10} className="animate-spin" /> Testing…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-graphite/60 px-2 py-0.5 text-[10.5px] text-fog">
      <Clock3 size={10} /> Untested
    </span>
  );
}

function ProviderRow({
  provider,
  onEdit,
  onTest,
  onDelete,
}: {
  provider: AiProviderConfig;
  onEdit: (provider: AiProviderConfig) => void;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const preset = presetById(provider.providerKind);
  const Icon = preset.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-graphite/70 bg-carbon/50 px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-graphite text-mist">
        <Icon size={15} className={preset.tint} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] text-mist">{provider.name}</span>
          <span
            className={`shrink-0 rounded-pill px-1.5 py-0.5 text-[10.5px] font-medium ${preset.chip}`}
          >
            {preset.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-fog">
          <span className="truncate">{provider.modelId}</span>
          <span className="text-fog/40">·</span>
          <span className="inline-flex items-center gap-1 truncate">
            <KeyRound
              size={9}
              className={provider.credentialConfigured ? "text-acid-lime/70" : "text-fog/40"}
            />
            {provider.credentialHint ?? "no key · local"}
          </span>
        </div>
      </div>
      <StatusPill
        status={provider.connectionStatus}
        latencyMs={provider.latencyMs}
        error={provider.testError}
      />
      <button
        type="button"
        aria-label={`Test ${provider.name}`}
        title="Test connection"
        onClick={() => onTest(provider.id)}
        disabled={provider.connectionStatus === "testing"}
        className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist disabled:opacity-60"
      >
        <RefreshCw
          size={13}
          className={provider.connectionStatus === "testing" ? "animate-spin" : ""}
        />
      </button>
      <button
        type="button"
        aria-label={`Edit ${provider.name}`}
        onClick={() => onEdit(provider)}
        className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        aria-label={`Remove ${provider.name}`}
        onClick={() => onDelete(provider.id)}
        className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

type TestState =
  | null
  | "testing"
  | { status: "connected"; latencyMs?: number }
  | { status: "failed"; error: string };

function ProviderForm({
  api,
  initial,
  onSave,
  onCancel,
}: {
  api: AiConfigApi;
  initial?: AiProviderConfig;
  onSave: (provider: AiProviderConfig) => void;
  onCancel: () => void;
}) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [kindId, setKindId] = useState<ProviderKind>(
    initial?.providerKind ?? "anthropic",
  );
  const [baseUrl, setBaseUrl] = useState(
    initial?.baseUrl ?? AI_PROVIDER_PRESETS[0].baseUrl,
  );
  const [modelId, setModelId] = useState(initial?.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preset = presetById(kindId);

  const pickKind = (id: ProviderKind) => {
    const next = presetById(id);
    setKindId(id);
    setBaseUrl(next.baseUrl);
    setApiKey("");
    setShowKey(false);
    setTest(null);
    setError(null);
  };

  const runTest = async () => {
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModelId = modelId.trim();
    if (!trimmedBaseUrl || !trimmedModelId) {
      setTest({
        status: "failed",
        error: "Complete Base URL and Model ID before testing.",
      });
      return;
    }
    setTest("testing");
    setError(null);
    try {
      // Probe runs against the form values without persisting, so both
      // add and edit flows can verify the endpoint before saving. For an
      // existing provider with a blank key, the saved key is reused.
      const result = await api.probe({
        providerKind: kindId,
        baseUrl: trimmedBaseUrl,
        modelId: trimmedModelId,
        apiKey: apiKey.trim() || undefined,
        existingId: initial?.id,
      });
      if (result.status === "connected") {
        setTest({ status: "connected", latencyMs: result.latencyMs });
      } else {
        setTest({
          status: "failed",
          error: result.error ?? "The connection test failed.",
        });
      }
    } catch (error) {
      setTest({
        status: "failed",
        error:
          error instanceof IpcCommandError && error.message
            ? error.message
            : "The connection test failed.",
      });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedModelId = modelId.trim();
    if (
      !trimmedName ||
      !trimmedBaseUrl ||
      !trimmedModelId ||
      (preset.needsKey && isNew && !apiKey.trim())
    ) {
      setError("Complete the required provider fields before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        providerKind: kindId,
        name: trimmedName,
        baseUrl: trimmedBaseUrl,
        modelId: trimmedModelId,
        apiKey: apiKey.trim() || undefined,
        isDefault: initial?.isDefault ?? false,
      };
      const saved = initial
        ? await api.update({ ...input, id: initial.id })
        : await api.create(input);
      onSave(saved);
    } catch (error) {
      setError(
        error instanceof IpcCommandError && error.message
          ? error.message
          : "The provider configuration could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-md border border-graphite bg-carbon px-2.5 py-1.5 text-[12.5px] text-mist outline-none transition-colors focus:border-acid-lime/60";
  const labelClass =
    "block text-[11px] font-semibold uppercase tracking-[0.06em] text-fog/70";
  const canSave = Boolean(
    name.trim() &&
      baseUrl.trim() &&
      modelId.trim() &&
      (!preset.needsKey || !isNew || apiKey.trim()),
  );
  const canTest = Boolean(
    baseUrl.trim() &&
      modelId.trim() &&
      (!preset.needsKey || apiKey.trim() || initial?.credentialConfigured),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 p-4 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="pop-in flex w-[min(480px,94vw)] flex-col overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_30px_90px_rgb(0_0_0/0.65)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-graphite px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-acid-lime">
              <Sparkles size={15} />
            </span>
            <h2 className="m-0 text-[14px] font-semibold tracking-tight text-paper">
              {isNew ? "Add AI provider" : "Edit AI provider"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            <X size={16} />
          </button>
        </header>

        <div className="scroll-thin grid max-h-[70vh] gap-3.5 overflow-y-auto px-5 py-4">
          <label className="grid gap-1">
            <span className={labelClass}>Display name</span>
            <input
              aria-label="Display name"
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Claude Sonnet 5"
              autoFocus
            />
          </label>

          <label className="grid gap-1">
            <span className={labelClass}>Provider type</span>
            <select
              aria-label="Provider type"
              className={fieldClass}
              value={kindId}
              onChange={(event) => pickKind(event.target.value as ProviderKind)}
            >
              {AI_PROVIDER_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="mt-0.5 text-[11px] text-fog/70">
              <Cloud size={10} className="mr-1 inline align-middle text-fog/60" />
              {preset.providerLayer}
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={labelClass}>Base URL</span>
              <input
                aria-label="Base URL"
                className={`${fieldClass} font-mono`}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Model ID</span>
              <input
                aria-label="Model ID"
                className={`${fieldClass} font-mono`}
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder="e.g. claude-sonnet-5"
              />
            </label>
          </div>

          {preset.needsKey ? (
            <label className="grid gap-1">
              <span className={labelClass}>API key</span>
              <span className="flex items-stretch overflow-hidden rounded-md border border-graphite bg-carbon focus-within:border-acid-lime/60">
                <input
                  aria-label="API key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={
                    initial?.credentialConfigured
                      ? "Leave blank to keep the current key"
                      : "Paste your API key"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-mist outline-none placeholder:text-fog/50"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((current) => !current)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  title={showKey ? "Hide" : "Show"}
                  className="grid w-9 shrink-0 place-items-center text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  {showKey ? <Lock size={13} /> : <Shield size={13} />}
                </button>
              </span>
              <span className="mt-0.5 text-[11px] leading-relaxed text-fog/70">
                Encrypted and saved in the local provider configuration.
              </span>
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-graphite bg-carbon/40 px-3 py-2 text-[11.5px] text-fog">
              <ShieldCheck size={12} className="text-acid-lime" />
              Local runtime — no API key required.
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-graphite/60 pt-3">
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={test === "testing" || !canTest}
              title={
                !canTest
                  ? "Fill Base URL and Model ID (and API key if required) to test"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={12}
                className={test === "testing" ? "animate-spin" : ""}
              />
              {test === "testing" ? "Testing…" : "Test connection"}
            </button>
            {!canTest ? (
              <span className="text-[11.5px] text-fog/60">
                Fill Base URL and Model ID to probe the endpoint.
              </span>
            ) : test === "testing" ? (
              <span className="text-[11.5px] text-fog">
                Connecting and probing endpoint…
              </span>
            ) : test?.status === "connected" ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-pulse-green">
                <Check size={11} /> Connected
                {test.latencyMs === undefined ? "" : ` · ${test.latencyMs} ms`}
              </span>
            ) : test?.status === "failed" ? (
              <span
                className="inline-flex items-center gap-1 text-[11.5px] text-coral-red"
                title={test.error}
              >
                <AlertTriangle size={11} /> {test.error}
              </span>
            ) : (
              <span className="text-[11.5px] text-fog/60">
                Probe the endpoint without saving.
              </span>
            )}
          </div>
          {error ? (
            <p role="alert" className="m-0 text-[11.5px] text-coral-red">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-graphite bg-obsidian/40 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSave}
            className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3 py-1.5 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105 disabled:opacity-60"
          >
            <Check size={13} />
            Save provider
          </button>
        </footer>
      </form>
    </div>
  );
}

export function AiProvidersSection({ api }: { api: AiConfigApi }) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [editing, setEditing] = useState<AiProviderConfig | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .list()
      .then((items) => {
        if (active) setProviders(items);
      })
      .catch(() => {
        if (active) setError("AI providers could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [api]);

  const test = async (id: string) => {
    setProviders((current) =>
      current.map((provider) =>
        provider.id === id
          ? { ...provider, connectionStatus: "testing" }
          : provider,
      ),
    );
    try {
      const tested = await api.test(id);
      setProviders((current) =>
        current.map((provider) => (provider.id === id ? tested : provider)),
      );
      setError(null);
    } catch {
      setProviders((current) =>
        current.map((provider) =>
          provider.id === id
            ? {
                ...provider,
                connectionStatus: "failed",
                testError: "The connection test failed.",
              }
            : provider,
        ),
      );
      setError("The connection test failed.");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(id);
      setProviders((current) => current.filter((provider) => provider.id !== id));
      setError(null);
    } catch {
      setError("The provider configuration could not be deleted.");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-graphite/70 bg-obsidian/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-graphite text-mist">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">
                AI providers
              </h2>
              <p className="m-0 mt-0.5 text-[12px] text-fog">
                Configure one or more model providers · API key saved with the provider config
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-2.5 py-1.5 text-[12px] font-semibold text-void transition hover:brightness-105"
          >
            <Plus size={13} /> Add provider
          </button>
        </div>
        {error ? (
          <p role="alert" className="mb-2 mt-0 text-[11.5px] text-coral-red">
            {error}
          </p>
        ) : null}
        <div className="grid gap-1.5">
          {providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onEdit={setEditing}
              onTest={(id) => void test(id)}
              onDelete={(id) => void remove(id)}
            />
          ))}
          {providers.length === 0 ? (
            <p className="m-0 px-2 py-6 text-center text-[12.5px] text-fog">
              No AI providers configured yet.
            </p>
          ) : null}
        </div>
      </div>

      {editing ? (
        <ProviderForm
          api={api}
          initial={editing === "new" ? undefined : editing}
          onSave={(saved) => {
            setProviders((current) =>
              current.some((provider) => provider.id === saved.id)
                ? current.map((provider) =>
                    provider.id === saved.id ? saved : provider,
                  )
                : [...current, saved],
            );
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
