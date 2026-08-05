import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success, type IpcResult } from "../../ipc/result.js";
import { KnownHostsRepository } from "./known-hosts.js";
import { SshRuntime } from "./runtime.js";

const byte = z.number().int().min(0).max(255);
const size = z.object({
  cols: z.number().int().min(0).max(65_535),
  rows: z.number().int().min(0).max(65_535),
});
const session = z.object({ sessionId: z.string() });
const profile = z.object({
  hostId: z.string(),
  hostname: z.string(),
  port: z.number().int().min(0).max(65_535).nullable().optional(),
  username: z.string(),
  authKind: z.enum(["password", "privateKey"]),
  credentialRef: z.string(),
  identityId: z.string().nullable().optional(),
  keepaliveInterval: z.number().int().nonnegative().nullable().optional(),
});
const credential = z.discriminatedUnion("type", [
  z.object({ type: z.literal("password"), password: z.string() }),
  z.object({
    type: z.literal("privateKey"),
    privateKey: z.array(byte).max(16 * 1024 * 1024),
    passphrase: z.string().nullable(),
  }),
]);

export function createSshCommandHandlers(
  runtime: SshRuntime,
  knownHosts: KnownHostsRepository,
): CommandHandlers {
  return {
    ssh_store_credential: command(
      z.object({ credential }),
      ({ credential }) => runtime.storeCredential(
        credential.type === "password"
          ? credential
          : { ...credential, privateKey: Buffer.from(credential.privateKey) },
      ),
    ),
    ssh_open: command(
      z.object({ profile, size }),
      ({ profile, size }, context) => runtime.open(profile, size, context.streamId),
    ),
    ssh_decide_host_key: command(
      z.object({ sessionId: z.string(), trust: z.boolean() }),
      ({ sessionId, trust }) => runtime.decideHostKey(sessionId, trust),
    ),
    ssh_reconnect: command(session, ({ sessionId }) => runtime.reconnect(sessionId)),
    ssh_list_known_hosts: command(z.object({}), () => knownHosts.list()),
    ssh_delete_known_host: command(
      z.object({
        hostname: z.string(),
        port: z.number().int().min(0).max(65_535),
      }),
      ({ hostname, port }) => knownHosts.remove(hostname, port),
    ),
  };
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input, context: CommandContext) => Output | Promise<Output>,
): CommandHandler {
  return async (rawInput, context) => {
    try {
      const input = schema.parse(rawInput ?? {});
      const output = await operation(input, context);
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
