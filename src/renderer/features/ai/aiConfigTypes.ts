export type ProviderKind =
  | "anthropic"
  | "openai"
  | "glm"
  | "kimi"
  | "deepseek"
  | "glmCodingPlan"
  | "kimiCode"
  | "custom"
  | "ollama";

export type ConnectionStatus = "untested" | "testing" | "connected" | "failed";
export type CapabilitySupport = "untested" | "supported" | "unsupported";

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

export type UpdateAiProviderConfig = CreateAiProviderConfig & {
  id: string;
};

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

export type AiConfigApi = {
  list: () => Promise<AiProviderConfig[]>;
  create: (input: CreateAiProviderConfig) => Promise<AiProviderConfig>;
  update: (input: UpdateAiProviderConfig) => Promise<AiProviderConfig>;
  delete: (id: string) => Promise<void>;
  test: (id: string) => Promise<AiProviderConfig>;
  probe: (input: ProbeAiProviderInput) => Promise<ProviderTestResult>;
};
