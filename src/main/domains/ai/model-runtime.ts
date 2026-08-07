import { streamSimple as streamAnthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import { streamSimple as streamOpenAi } from "@earendil-works/pi-ai/api/openai-completions";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Usage,
} from "@earendil-works/pi-ai";
import type { AiConfigRepository } from "./repository.js";
import type { ProviderTestResult, ResolvedAiProviderConfig } from "./types.js";
import { now, UNTESTED_CAPABILITIES } from "./types.js";

export class AiModelRuntime {
  readonly #repository: AiConfigRepository;

  constructor(repository: AiConfigRepository) {
    this.#repository = repository;
  }

  model(providerConfigId: string): Model<string> {
    return createModel(this.#repository.getResolved(providerConfigId));
  }

  stream(
    providerConfigId: string,
    context: Context,
    options: SimpleStreamOptions = {},
  ): AssistantMessageEventStream {
    let config: ResolvedAiProviderConfig;
    try {
      config = this.#repository.getResolved(providerConfigId);
    } catch (error) {
      return failedStream(fallbackModel(), safeMessage(error));
    }
    const model = createModel(config);
    debugModelMessage("input", {
      providerConfigId,
      model: { provider: model.provider, id: model.id, api: model.api },
      context,
      options: publicStreamOptions(options),
    });
    try {
      const source = createStream(config, context, {
        ...options,
        apiKey: effectiveApiKey(config),
        maxRetries: options.maxRetries ?? 1,
      });
      return sanitizedStream(source, model, config.apiKey);
    } catch (error) {
      return failedStream(model, safeMessage(error, config.apiKey));
    }
  }

  async complete(
    providerConfigId: string,
    context: Context,
    options: SimpleStreamOptions = {},
  ): Promise<AssistantMessage> {
    return this.stream(providerConfigId, context, options).result();
  }

  async probe(config: ResolvedAiProviderConfig): Promise<ProviderTestResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    timer.unref();
    try {
      const stream = sanitizedStream(createStream(config, {
        systemPrompt: undefined,
        messages: [{ role: "user", content: "Reply with OK.", timestamp: Date.now() }],
      }, {
        apiKey: effectiveApiKey(config),
        maxTokens: 1,
        temperature: 0,
        maxRetries: 0,
        timeoutMs: 30_000,
        signal: controller.signal,
      }), createModel(config), config.apiKey);
      const result = await stream.result();
      if (result.stopReason === "error" || result.stopReason === "aborted") {
        throw new Error(result.errorMessage ?? "Provider request failed.");
      }
      return {
        status: "connected",
        latencyMs: Date.now() - started,
        testedAt: now(),
        capabilities: {
          streaming: "supported",
          toolCalling: "supported",
          structuredOutput: "untested",
          reasoning: "untested",
        },
      };
    } catch (error) {
      return {
        status: "failed",
        testedAt: now(),
        error: safeMessage(error, config.apiKey),
        capabilities: { ...UNTESTED_CAPABILITIES },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function createStream(
  config: ResolvedAiProviderConfig,
  context: Context,
  options: SimpleStreamOptions,
): AssistantMessageEventStream {
  const model = createModel(config);
  return model.api === "anthropic-messages"
    ? streamAnthropic(model as Model<"anthropic-messages">, context, options)
    : streamOpenAi(model as Model<"openai-completions">, context, options);
}

function createModel(config: ResolvedAiProviderConfig): Model<string> {
  const metadata = config.public;
  const pricing = metadata.pricing;
  return {
    id: metadata.modelId,
    name: metadata.name,
    api: metadata.providerKind === "anthropic" ? "anthropic-messages" : "openai-completions",
    provider: `terminus:${metadata.id}`,
    baseUrl: metadata.baseUrl,
    reasoning: metadata.capabilities.reasoning === "supported",
    thinkingLevelMap: { max: "max" },
    input: ["text"],
    cost: {
      input: pricing?.inputPerMillion ?? 0,
      output: pricing?.outputPerMillion ?? 0,
      cacheRead: pricing?.cacheReadPerMillion ?? 0,
      cacheWrite: pricing?.cacheWritePerMillion ?? 0,
    },
    contextWindow: metadata.contextWindowTokens ?? 128_000,
    maxTokens: metadata.maxOutputTokens ?? 8_192,
  };
}

function effectiveApiKey(config: ResolvedAiProviderConfig): string | undefined {
  return config.apiKey ?? (config.public.providerKind === "ollama" ? "ollama" : undefined);
}

function sanitizedStream(
  source: AssistantMessageEventStream,
  model: Model<string>,
  apiKey?: string,
): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  void (async () => {
    try {
      for await (const event of source) {
        const sanitized = sanitizeEvent(event, apiKey);
        debugModelMessage("output", sanitized);
        output.push(sanitized);
      }
    } catch (error) {
      const event = errorEvent(model, safeMessage(error, apiKey));
      debugModelMessage("output", event);
      output.push(event);
    }
  })();
  return output;
}

function sanitizeEvent(event: AssistantMessageEvent, apiKey?: string): AssistantMessageEvent {
  if (event.type !== "error") return event;
  return {
    ...event,
    error: {
      ...event.error,
      errorMessage: safeMessage(event.error.errorMessage, apiKey),
    },
  };
}

function failedStream(model: Model<string>, message: string): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  queueMicrotask(() => {
    const event = errorEvent(model, message);
    debugModelMessage("output", event);
    output.push(event);
  });
  return output;
}

function errorEvent(model: Model<string>, message: string): AssistantMessageEvent {
  return {
    type: "error",
    reason: "error",
    error: {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyUsage(),
      stopReason: "error",
      errorMessage: message,
      timestamp: Date.now(),
    },
  };
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function fallbackModel(): Model<string> {
  return {
    id: "unavailable",
    name: "Unavailable",
    api: "openai-completions",
    provider: "terminus:unavailable",
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
  };
}

function safeMessage(error: unknown, apiKey?: string): string {
  let message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "The AI provider request failed.";
  if (apiKey) message = message.split(apiKey).join("[redacted]");
  return message.slice(0, 1_000);
}

function debugModelMessage(direction: "input" | "output", value: unknown): void {
  if (!agentDebugEnabled()) return;
  console.debug(`[agent-runtime:model:${direction}]`, redactModelDebugValue(value));
}

function agentDebugEnabled(): boolean {
  return process.defaultApp === true || process.env.BUZZ_AGENT_DEBUG === "1";
}

function publicStreamOptions(options: SimpleStreamOptions): Record<string, unknown> {
  return {
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.signal ? { aborted: options.signal.aborted } : {}),
  };
}

function redactModelDebugValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value, (key, nested) => {
      if (isSensitiveModelDebugKey(key)) return "[redacted]";
      return typeof nested === "string"
        ? redactModelDebugText(nested)
        : nested;
    })) as unknown;
  } catch {
    return "[unserializable]";
  }
}

function isSensitiveModelDebugKey(key: string): boolean {
  return /^(apiKey|password|passphrase|privateKey|credential|credentialRef|secret|token|authorization|thinkingSignature|thoughtSignature)$/i
    .test(key);
}

function redactModelDebugText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[redacted private key]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted api key]")
    .replace(/\b(password|passphrase|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi,
      "$1=[redacted]");
}
