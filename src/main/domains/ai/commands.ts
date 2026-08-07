import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success } from "../../../shared/ipc/result.js";
import type { AiService } from "./service.js";
import type {
  CreateAiProviderConfig,
  ProbeAiProviderInput,
  ProviderKind,
  ProviderTestResult,
  ResolvedAiProviderConfig,
  UpdateAiProviderConfig,
} from "./types.js";
import { normalizeProbe, requiresCredential } from "./validation.js";

const providerKind = z.enum([
  "anthropic", "openai", "glm", "kimi", "deepseek", "glmCodingPlan", "kimiCode",
  "custom", "ollama",
]);
const pricing = z.object({
  inputPerMillion: z.number(),
  outputPerMillion: z.number(),
  cacheReadPerMillion: z.number(),
  cacheWritePerMillion: z.number(),
});
const providerInput = z.object({
  providerKind,
  name: z.string(),
  baseUrl: z.string(),
  modelId: z.string(),
  apiKey: z.string().optional(),
  isDefault: z.boolean(),
  contextWindowTokens: z.number().int().nonnegative().optional(),
  maxOutputTokens: z.number().int().nonnegative().optional(),
  pricing: pricing.optional(),
});
const id = z.string().trim().min(1);
const prompt = z.string().trim().min(1);

export function createAiCommandHandlers(
  service: AiService,
  emit: (streamId: string | undefined, event: unknown) => void,
): CommandHandlers {
  return {
    ai_list_provider_configs: command(z.object({}), () => service.configs.list()),
    ai_create_provider_config: command(
      z.object({ input: providerInput }),
      async ({ input }) => testSaved(
        service,
        service.configs.create(input as CreateAiProviderConfig).id,
      ),
    ),
    ai_update_provider_config: command(
      z.object({ input: providerInput.extend({ id }) }),
      async ({ input }) => testSaved(
        service,
        service.configs.update(input as UpdateAiProviderConfig).id,
      ),
    ),
    ai_delete_provider_config: command(
      z.object({ id }),
      ({ id: configId }) => service.configs.delete(configId),
    ),
    ai_test_provider_config: command(
      z.object({ id }),
      ({ id: configId }) => testSaved(service, configId),
    ),
    ai_probe_provider_config: command(
      z.object({ input: z.object({
        providerKind,
        baseUrl: z.string(),
        modelId: z.string(),
        apiKey: z.string().optional(),
        existingId: z.string().optional(),
      }) }),
      ({ input }) => probe(service, input as ProbeAiProviderInput),
    ),
    ai_agent_create: command(
      z.object({ providerConfigId: id, sshSessionId: id }),
      ({ providerConfigId, sshSessionId }, context) => {
        const snapshot = service.agents.create(
          context.ownerId,
          providerConfigId,
          sshSessionId,
        );
        return { agentId: snapshot.agentId, snapshot };
      },
    ),
    ai_agent_prompt: command(
      z.object({ agentId: id, text: prompt }),
      ({ agentId, text }, context) => {
        if (!context.streamId) throw new DomainError(
          "AI_PROTOCOL",
          "The AI prompt requires a finite event stream.",
        );
        return service.agents.prompt(
          context.ownerId,
          agentId,
          text,
          (event) => emit(context.streamId, event),
        );
      },
    ),
    ai_agent_steer: command(
      z.object({ agentId: id, text: prompt }),
      ({ agentId, text }, context) => service.agents.steer(context.ownerId, agentId, text),
    ),
    ai_agent_abort: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => service.agents.abort(context.ownerId, agentId),
    ),
    ai_agent_decide_tool: command(
      z.object({ agentId: id, confirmationId: id, approved: z.boolean() }),
      ({ agentId, confirmationId, approved }, context) =>
        service.agents.decideTool(
          context.ownerId,
          agentId,
          confirmationId,
          approved,
        ),
    ),
    ai_agent_close: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => service.agents.close(context.ownerId, agentId),
    ),
    ai_list_sessions: command(z.object({}), () => service.history.list()),
    ai_load_session: command(z.object({ id }), ({ id: sessionId }) =>
      service.history.load(sessionId)),
    ai_delete_session: command(z.object({ id }), ({ id: sessionId }) =>
      service.history.delete(sessionId)),
    ai_rename_session: command(z.object({ id, title: z.string() }), ({ id: sessionId, title }) =>
      service.history.rename(sessionId, title)),
  };
}

async function testSaved(service: AiService, configId: string) {
  service.configs.setTesting(configId);
  const result = await service.models.probe(service.configs.getResolved(configId));
  return service.configs.saveTestResult(configId, result);
}

async function probe(service: AiService, input: ProbeAiProviderInput): Promise<ProviderTestResult> {
  const normalized = normalizeProbe(input);
  let apiKey = input.apiKey?.trim() || undefined;
  if (requiresCredential(input.providerKind) && !apiKey && input.existingId) {
    apiKey = service.configs.getResolved(input.existingId).apiKey;
  }
  if (requiresCredential(input.providerKind) && !apiKey) {
    throw new DomainError(
      "AI_CONFIG_VALIDATION_FAILED",
      "API key is required for this provider.",
    );
  }
  const timestamp = new Date().toISOString();
  const resolved: ResolvedAiProviderConfig = {
    apiKey,
    public: {
      id: "",
      providerKind: input.providerKind as ProviderKind,
      name: "",
      baseUrl: normalized.baseUrl,
      modelId: normalized.modelId,
      credentialConfigured: Boolean(apiKey),
      isDefault: false,
      connectionStatus: "untested",
      capabilities: {
        streaming: "untested",
        toolCalling: "untested",
        structuredOutput: "untested",
        reasoning: "untested",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
  return service.models.probe(resolved);
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input, context: CommandContext) => Output | Promise<Output>,
): CommandHandler {
  return async (raw, context) => {
    try {
      return success(await operation(schema.parse(raw ?? {}), context));
    } catch (error) {
      if (error instanceof DomainError) return error.toResult();
      if (error instanceof ZodError) {
        return failure("IPC_INVALID_INPUT", "The desktop operation received invalid input.");
      }
      throw error;
    }
  };
}
