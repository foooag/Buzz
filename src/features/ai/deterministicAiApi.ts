import type {
  AiConfigApi,
  AiProviderConfig,
  CreateAiProviderConfig,
  ProbeAiProviderInput,
  ProviderKind,
  ProviderTestResult,
  UpdateAiProviderConfig,
} from "./aiConfigTypes";
const DEFAULT_URLS: Record<ProviderKind, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  kimi: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
  glmCodingPlan: "https://open.bigmodel.cn/api/coding/paas/v4",
  kimiCode: "https://api.kimi.com/coding/v1",
  custom: "",
  ollama: "http://127.0.0.1:11434/v1",
};

function hint(key?: string): string | undefined {
  const value = key?.trim();
  if (!value) return undefined;
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`;
}

export function createDeterministicAiConfigApi(
  initial: AiProviderConfig[] = [],
): AiConfigApi {
  const configs = new Map(initial.map((config) => [config.id, { ...config }]));
  let seq = initial.length + 1;
  const stamp = (): string => new Date().toISOString();

  const probe = (existing: AiProviderConfig): AiProviderConfig => ({
    ...existing,
    connectionStatus:
      existing.providerKind === "kimi" ? "failed" : "connected",
    latencyMs: existing.providerKind === "kimi" ? undefined : 412,
    testedAt: stamp(),
    testError:
      existing.providerKind === "kimi"
        ? "The provider rejected the saved credential."
        : undefined,
    capabilities: {
      streaming: existing.providerKind === "kimi" ? "untested" : "supported",
      toolCalling: existing.providerKind === "kimi" ? "untested" : "supported",
      structuredOutput:
        existing.providerKind === "kimi" ? "untested" : "supported",
      reasoning: "untested",
    },
    updatedAt: stamp(),
  });

  const normalize = (
    input: CreateAiProviderConfig,
    existing?: AiProviderConfig,
  ): AiProviderConfig => {
    const timestamp = stamp();
    const credentialHint =
      input.providerKind === "ollama"
        ? undefined
        : hint(input.apiKey) ?? existing?.credentialHint;
    return {
      id: existing?.id ?? `pc-${seq++}`,
      providerKind: input.providerKind,
      name: input.name.trim(),
      baseUrl: input.baseUrl.trim() || DEFAULT_URLS[input.providerKind],
      modelId: input.modelId.trim(),
      credentialConfigured:
        input.providerKind !== "ollama" &&
        Boolean(credentialHint ?? existing?.credentialConfigured),
      credentialHint,
      isDefault: input.isDefault,
      connectionStatus: existing?.connectionStatus ?? "untested",
      latencyMs: existing?.latencyMs,
      testedAt: existing?.testedAt,
      testError: existing?.testError,
      capabilities: existing?.capabilities ?? {
        streaming: "untested",
        toolCalling: "untested",
        structuredOutput: "untested",
        reasoning: "untested",
      },
      contextWindowTokens: input.contextWindowTokens,
      maxOutputTokens: input.maxOutputTokens,
      pricing: input.pricing,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  };

  return {
    async list() {
      return [...configs.values()];
    },
    async create(input: CreateAiProviderConfig) {
      const config = normalize(input);
      if (config.isDefault) {
        for (const existing of configs.values()) existing.isDefault = false;
      }
      const tested = probe(config);
      configs.set(config.id, tested);
      return { ...tested };
    },
    async update(input: UpdateAiProviderConfig) {
      const existing = configs.get(input.id);
      if (!existing) throw new Error("not found");
      const updated = normalize(input, existing);
      const changed =
        existing.providerKind !== updated.providerKind ||
        existing.baseUrl !== updated.baseUrl ||
        existing.modelId !== updated.modelId ||
        Boolean(input.apiKey?.trim());
      if (changed) {
        updated.connectionStatus = "untested";
        updated.latencyMs = undefined;
        updated.testedAt = undefined;
        updated.testError = undefined;
        updated.capabilities = {
          streaming: "untested",
          toolCalling: "untested",
          structuredOutput: "untested",
          reasoning: "untested",
        };
      }
      if (updated.isDefault) {
        for (const other of configs.values()) other.isDefault = false;
      }
      const tested = probe(updated);
      configs.set(tested.id, tested);
      return { ...tested };
    },
    async delete(id: string) {
      if (!configs.delete(id)) throw new Error("not found");
    },
    async test(id: string) {
      const existing = configs.get(id);
      if (!existing) throw new Error("not found");
      const tested = probe(existing);
      configs.set(id, tested);
      return { ...tested };
    },
    async probe(input: ProbeAiProviderInput): Promise<ProviderTestResult> {
      const baseUrl = input.baseUrl.trim() || DEFAULT_URLS[input.providerKind];
      const modelId = input.modelId.trim();
      if (!baseUrl || !modelId) {
        throw new Error(
          "Base URL and Model ID are required to test the connection.",
        );
      }
      const existing = input.existingId ? configs.get(input.existingId) : undefined;
      const hasKey =
        input.providerKind === "ollama" ||
        Boolean(input.apiKey?.trim()) ||
        Boolean(existing?.credentialConfigured);
      if (input.providerKind !== "ollama" && !hasKey) {
        throw new Error("API key is required for this provider.");
      }
      const template: AiProviderConfig = {
        id: existing?.id ?? "probe",
        providerKind: input.providerKind,
        name: existing?.name ?? "",
        baseUrl,
        modelId,
        credentialConfigured: hasKey,
        credentialHint: existing?.credentialHint,
        isDefault: existing?.isDefault ?? false,
        connectionStatus: "untested",
        capabilities: {
          streaming: "untested",
          toolCalling: "untested",
          structuredOutput: "untested",
          reasoning: "untested",
        },
        createdAt: existing?.createdAt ?? stamp(),
        updatedAt: stamp(),
      };
      const probed = probe(template);
      return {
        status: probed.connectionStatus,
        latencyMs: probed.latencyMs,
        testedAt: probed.testedAt ?? stamp(),
        error: probed.testError,
        capabilities: probed.capabilities,
      };
    },
  };
}
