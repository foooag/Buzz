import { z, ZodError, type ZodType } from "zod";
import type { CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success } from "../../../shared/ipc/result.js";
import type { QuickScriptGeneratedEvent } from "../../../shared/ipc/quickscripts/types.js";
import type { QuickScriptsService } from "./service.js";

const sshSessionId = z.string().trim().min(1);
const hostId = z.string().trim().min(1);
const id = z.string().trim().min(1);
const patch = z.object({
  title: z.string().trim().min(1).optional(),
  script: z.string().trim().min(1).optional(),
  status: z.enum(["suggested", "pinned", "dismissed"]).optional(),
  executedCount: z.number().int().min(0).optional(),
});

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input) => Output | Promise<Output>,
): CommandHandler {
  return async (rawInput) => {
    try {
      const input = schema.parse(rawInput ?? {});
      return success(await operation(input));
    } catch (error) {
      if (error instanceof ZodError) {
        return failure("IPC_INVALID_INPUT", "The desktop operation received invalid input.");
      }
      throw error;
    }
  };
}

export function createQuickScriptsCommandHandlers(
  service: QuickScriptsService,
  broadcast?: (event: QuickScriptGeneratedEvent) => void,
): CommandHandlers {
  return {
    quickscript_generate: command(
      z.object({ sshSessionId, useLlm: z.boolean().optional() }),
      async ({ sshSessionId: session, useLlm }) => {
        const result = await service.generate({ sshSessionId: session, useLlm });
        if (result.mode !== "empty" && broadcast) {
          broadcast({ hostId: result.hostId, sshSessionId: session, createdCount: result.createdCount, mode: result.mode });
        }
        return result;
      },
    ),
    quickscript_list: command(
      z.object({ hostId, includeDismissed: z.boolean().optional() }),
      ({ hostId: host, includeDismissed }) => service.list(host, includeDismissed),
    ),
    quickscript_update: command(
      z.object({ id, patch }),
      ({ id: scriptId, patch: changes }) => service.update(scriptId, changes),
    ),
    quickscript_delete: command(z.object({ id }), ({ id: scriptId }) => {
      service.delete(scriptId);
      return { id: scriptId };
    }),
    quickscript_clear_data: command(
      z.object({ hostId: hostId.optional() }),
      ({ hostId: host }) => {
        if (host) service.deleteForHost(host);
        else service.clearAll();
        return { hostId: host ?? null };
      },
    ),
  };
}
