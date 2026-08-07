import { z } from "zod";

export const providerKindSchema = z.enum([
  "anthropic",
  "openai",
  "glm",
  "kimi",
  "deepseek",
  "glmCodingPlan",
  "kimiCode",
  "custom",
  "ollama",
]);

const capabilitySupportSchema = z.enum([
  "untested",
  "supported",
  "unsupported",
]);

export const aiProviderConfigSchema = z.object({
  id: z.string(),
  providerKind: providerKindSchema,
  name: z.string(),
  baseUrl: z.string(),
  modelId: z.string(),
  credentialConfigured: z.boolean(),
  credentialHint: z.string().optional(),
  isDefault: z.boolean(),
  connectionStatus: z.enum(["untested", "testing", "connected", "failed"]),
  latencyMs: z.number().optional(),
  testedAt: z.string().optional(),
  testError: z.string().optional(),
  capabilities: z.object({
    streaming: capabilitySupportSchema,
    toolCalling: capabilitySupportSchema,
    structuredOutput: capabilitySupportSchema,
    reasoning: capabilitySupportSchema,
  }),
  contextWindowTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  pricing: z
    .object({
      inputPerMillion: z.number().finite().nonnegative(),
      outputPerMillion: z.number().finite().nonnegative(),
      cacheReadPerMillion: z.number().finite().nonnegative(),
      cacheWritePerMillion: z.number().finite().nonnegative(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createAiProviderConfigSchema = z
  .object({
    providerKind: providerKindSchema,
    name: z.string().trim().min(1),
    baseUrl: z.string().url(),
    modelId: z.string().trim().min(1),
    apiKey: z.string().optional(),
    isDefault: z.boolean().default(false),
    contextWindowTokens: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    pricing: z
      .object({
        inputPerMillion: z.number().finite().nonnegative(),
        outputPerMillion: z.number().finite().nonnegative(),
        cacheReadPerMillion: z.number().finite().nonnegative(),
        cacheWritePerMillion: z.number().finite().nonnegative(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.providerKind !== "ollama" && !value.apiKey?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "API key is required.",
      });
    }
    if (
      value.contextWindowTokens !== undefined &&
      value.maxOutputTokens !== undefined &&
      value.maxOutputTokens > value.contextWindowTokens
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxOutputTokens"],
        message: "Maximum output tokens cannot exceed the context window.",
      });
    }
  });
