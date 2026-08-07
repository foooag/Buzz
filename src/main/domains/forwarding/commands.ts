import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success, type IpcResult } from "../../../shared/ipc/result.js";
import { ForwardingRepository } from "./repository.js";
import { PortForwardingRuntime } from "./runtime.js";

const port = z.number().int().min(0).max(65_535);
const profile = z.object({
  hostId: z.string(), hostname: z.string(), port: port.nullable().optional(),
  username: z.string(), authKind: z.enum(["password", "privateKey"]),
  credentialRef: z.string(), identityId: z.string().nullable().optional(),
  keepaliveInterval: z.number().int().nonnegative().nullable().optional(),
});
const startRule = z.object({
  id: z.string(), kind: z.enum(["local", "remote", "dynamic"]),
  bindHost: z.string(), bindPort: port, targetHost: z.string().nullable(),
  targetPort: port.nullable(),
});
const storedRule = startRule.extend({
  hostId: z.string(), label: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

export function createForwardingCommandHandlers(
  runtime: PortForwardingRuntime,
  repository: ForwardingRepository,
): CommandHandlers {
  return {
    port_forward_start: command(
      z.object({ profile, rule: startRule }),
      ({ profile, rule }, context) => runtime.start(profile, rule, context.streamId),
    ),
    port_forward_decide_host_key: command(
      z.object({ ruleId: z.string(), trust: z.boolean() }),
      ({ ruleId, trust }) => runtime.decideHostKey(ruleId, trust),
    ),
    port_forward_stop: command(
      z.object({ ruleId: z.string() }),
      ({ ruleId }) => runtime.stop(ruleId),
    ),
    port_forward_list_active: command(z.object({}), () => runtime.listActive()),
    port_forward_list_rules: command(
      z.object({ hostId: z.string() }),
      ({ hostId }) => repository.listForHost(hostId),
    ),
    port_forward_create_rule: command(
      z.object({ rule: storedRule }),
      ({ rule }) => repository.createRule(rule),
    ),
    port_forward_update_rule: command(
      z.object({ rule: storedRule }),
      ({ rule }) => repository.updateRule(rule),
    ),
    port_forward_delete_rule: command(
      z.object({ ruleId: z.string() }),
      ({ ruleId }) => repository.delete(ruleId),
    ),
  };
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input, context: CommandContext) => Output | Promise<Output>,
): CommandHandler {
  return async (rawInput, context) => {
    try {
      const output = await operation(schema.parse(rawInput ?? {}), context);
      return isIpcResult(output) ? output : success(output);
    } catch (error) {
      if (error instanceof DomainError) return error.toResult();
      if (error instanceof ZodError) {
        return failure("IPC_INVALID_INPUT", "The desktop operation received invalid input.");
      }
      throw error;
    }
  };
}

function isIpcResult(value: unknown): value is IpcResult<unknown> {
  return typeof value === "object" && value !== null && "ok" in value;
}
