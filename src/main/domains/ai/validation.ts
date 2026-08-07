import { DomainError } from "../../ipc/domain-error.js";
import {
  DEFAULT_BASE_URLS,
  type CreateAiProviderConfig,
  type ModelPricing,
  type ProbeAiProviderInput,
  type ProviderKind,
  type UpdateAiProviderConfig,
} from "./types.js";

export function normalizeCreate(input: CreateAiProviderConfig) {
  validateMetadata(input.contextWindowTokens, input.maxOutputTokens, input.pricing);
  return {
    name: required(input.name, "Provider name"),
    baseUrl: normalizeBaseUrl(input.providerKind, input.baseUrl),
    modelId: required(input.modelId, "Model"),
    apiKey: normalizeCredential(input.providerKind, input.apiKey),
  };
}

export function normalizeUpdate(input: UpdateAiProviderConfig) {
  validateMetadata(input.contextWindowTokens, input.maxOutputTokens, input.pricing);
  return {
    name: required(input.name, "Provider name"),
    baseUrl: normalizeBaseUrl(input.providerKind, input.baseUrl),
    modelId: required(input.modelId, "Model"),
  };
}

export function normalizeProbe(input: ProbeAiProviderInput) {
  return {
    baseUrl: normalizeBaseUrl(input.providerKind, input.baseUrl),
    modelId: required(input.modelId, "Model"),
  };
}

export function requiresCredential(kind: ProviderKind): boolean {
  return kind !== "ollama";
}

export function normalizeCredential(kind: ProviderKind, value?: string): string | undefined {
  if (!requiresCredential(kind)) return undefined;
  const normalized = value?.trim();
  if (!normalized) throw validationError("API key is required for this provider.");
  return normalized;
}

export function credentialHint(value: string): string {
  const chars = [...value];
  if (chars.length <= 4) return "••••";
  return `${chars.slice(0, 3).join("")}••••••••${chars.slice(-4).join("")}`;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw validationError(`${label} is required.`);
  return normalized;
}

function normalizeBaseUrl(kind: ProviderKind, supplied: string): string {
  const value = supplied.trim() || DEFAULT_BASE_URLS[kind];
  if (!value) throw validationError("Base URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidEndpoint();
  }
  if (url.username || url.password || url.search || url.hash || !url.hostname) {
    throw invalidEndpoint();
  }
  return value.replace(/\/+$/, "");
}

function validateMetadata(
  contextWindowTokens?: number,
  maxOutputTokens?: number,
  pricing?: ModelPricing,
): void {
  if (contextWindowTokens === 0 || maxOutputTokens === 0) {
    throw validationError("Model token limits must be greater than zero.");
  }
  if (contextWindowTokens !== undefined && maxOutputTokens !== undefined &&
    maxOutputTokens > contextWindowTokens) {
    throw validationError("Maximum output tokens cannot exceed the context window.");
  }
  if (pricing && Object.values(pricing).some((rate) => !Number.isFinite(rate) || rate < 0)) {
    throw validationError("Model prices must be finite, non-negative values.");
  }
}

function validationError(message: string): DomainError {
  return new DomainError("AI_CONFIG_VALIDATION_FAILED", message);
}

function invalidEndpoint(): DomainError {
  return new DomainError(
    "AI_CONFIG_INVALID_ENDPOINT",
    "Base URL must be an absolute HTTP or HTTPS URL without credentials, query, or fragment.",
  );
}
