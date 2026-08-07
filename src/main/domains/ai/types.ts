export const PROVIDER_KINDS = [
  "anthropic",
  "openai",
  "glm",
  "kimi",
  "deepseek",
  "glmCodingPlan",
  "kimiCode",
  "custom",
  "ollama",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export type CapabilitySupport = "untested" | "supported" | "unsupported";
export type ConnectionStatus = "untested" | "testing" | "connected" | "failed";

export type ModelCapabilities = {
  streaming: CapabilitySupport;
  toolCalling: CapabilitySupport;
  structuredOutput: CapabilitySupport;
  reasoning: CapabilitySupport;
};

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
};

export type AiProviderConfig = {
  id: string;
  providerKind: ProviderKind;
  name: string;
  baseUrl: string;
  modelId: string;
  credentialConfigured: boolean;
  credentialHint?: string;
  isDefault: boolean;
  connectionStatus: ConnectionStatus;
  latencyMs?: number;
  testedAt?: string;
  testError?: string;
  capabilities: ModelCapabilities;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  pricing?: ModelPricing;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedAiProviderConfig = {
  public: AiProviderConfig;
  apiKey?: string;
};

export type CreateAiProviderConfig = {
  providerKind: ProviderKind;
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  isDefault: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  pricing?: ModelPricing;
};

export type UpdateAiProviderConfig = CreateAiProviderConfig & { id: string };

export type ProbeAiProviderInput = {
  providerKind: ProviderKind;
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  existingId?: string;
};

export type ProviderTestResult = {
  status: ConnectionStatus;
  latencyMs?: number;
  testedAt: string;
  error?: string;
  capabilities: ModelCapabilities;
};

export const UNTESTED_CAPABILITIES: ModelCapabilities = {
  streaming: "untested",
  toolCalling: "untested",
  structuredOutput: "untested",
  reasoning: "untested",
};

export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
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

export function now(): string {
  return new Date().toISOString();
}
