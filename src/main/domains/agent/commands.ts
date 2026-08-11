import { z, ZodError, type ZodType } from "zod";
import { failure, success } from "../../../shared/ipc/result.js";
import { DomainError } from "../../ipc/domain-error.js";
import type {
  CommandContext,
  CommandHandler,
  CommandHandlers,
} from "../../ipc/dispatcher.js";
import type { MultiHostAgentRuntime } from "./agent-runtime.js";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);

export function createAgentCommandHandlers(
  runtime: MultiHostAgentRuntime,
): CommandHandlers {
  return {
    agent_create: command(
      z.object({
        providerConfigId: id,
        vaultId: id.optional(),
        targets: z.array(id).optional(),
      }),
      (input, context) => runtime.create(context.ownerId, input),
    ),
    agent_steer: command(
      z.object({ agentId: id, text }),
      ({ agentId, text: prompt }, context) =>
        runtime.steer(context.ownerId, agentId, prompt),
    ),
    agent_abort: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => runtime.abort(context.ownerId, agentId),
    ),
    agent_decide_tool: command(
      z.object({ agentId: id, confirmationId: id, approved: z.boolean() }),
      ({ agentId, confirmationId, approved }, context) =>
        runtime.decideTool(context.ownerId, agentId, confirmationId, approved),
    ),
    agent_close: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => runtime.close(context.ownerId, agentId),
    ),
  };
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
