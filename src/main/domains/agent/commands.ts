import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success } from "../../../shared/ipc/result.js";
import type { MultiHostAgentRuntime } from "./agent-runtime.js";

const id = z.string().trim().min(1);
const prompt = z.string().trim().min(1);
const targets = z.array(id).max(64).optional();

export function createAgentCommandHandlers(
  runtime: MultiHostAgentRuntime,
  emit: (streamId: string | undefined, event: unknown) => void,
): CommandHandlers {
  return {
    agent_create: command(
      z.object({ providerConfigId: id, targets }),
      ({ providerConfigId, targets: agentTargets }, context) =>
        runtime.create(context.ownerId, {
          providerConfigId,
          targets: agentTargets ?? [],
        }),
    ),
    agent_prompt: command(
      z.object({ agentId: id, text: prompt, targets }),
      ({ agentId, text, targets: agentTargets }, context) => {
        if (!context.streamId) {
          throw new DomainError(
            "AGENT_PROTOCOL",
            "The agent prompt requires a finite event stream.",
          );
        }
        return runtime.prompt(
          context.ownerId,
          agentId,
          text,
          { targets: agentTargets ?? [] },
          (event) => emit(context.streamId, event),
        );
      },
    ),
    agent_steer: command(
      z.object({ agentId: id, text: prompt }),
      ({ agentId, text }, context) => runtime.steer(context.ownerId, agentId, text),
    ),
    agent_abort: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => runtime.abort(context.ownerId, agentId),
    ),
    agent_decide_tool: command(
      z.object({
        agentId: id,
        confirmationId: id,
        approved: z.boolean(),
        command: z.string().trim().min(1).max(8_000).optional(),
      }),
      ({ agentId, confirmationId, approved, command }, context) =>
        runtime.decideTool(
          context.ownerId,
          agentId,
          confirmationId,
          approved,
          command,
        ),
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
