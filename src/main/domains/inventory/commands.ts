import { z, ZodError, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success } from "../../../shared/ipc/result.js";
import type { InventoryRepository } from "./repository.js";

const string = z.string();
const optionalString = string.nullable().optional();
const optionalInteger = z.number().int().nonnegative().optional().nullable();
const hostBase = {
  vaultId: string,
  groupId: optionalString,
  name: string,
  address: string,
  authKind: optionalString,
  credentialRef: optionalString,
  startupCommands: z.array(string).optional(),
  protocol: optionalString,
  port: optionalInteger,
  baudRate: optionalInteger,
  identity: optionalString,
  jumpHost: optionalString,
  proxy: optionalString,
  env: z.record(string).optional(),
  startupSnippets: z.array(string).optional(),
  status: optionalString,
  label: string.optional(),
  lastConnected: string.optional(),
};
const createHost = z.object({
  ...hostBase,
  username: string.optional(),
  tags: z.array(string).optional(),
  notes: string.optional(),
});
const updateHost = z.object({
  ...hostBase,
  id: string,
  username: string,
  tags: z.array(string),
  notes: string,
});
const identityBase = {
  vaultId: string,
  name: string,
  username: string.optional(),
  type: optionalString,
  algorithm: optionalString,
  passphrase: z.boolean().nullable().optional(),
  expires: optionalString,
};

const emptyInput = z.object({});
const idInput = z.object({ id: string });
const vaultIdInput = z.object({ vaultId: string });

export function createInventoryCommandHandlers(
  repository: InventoryRepository,
): CommandHandlers {
  return {
    inventory_list_vaults: command(emptyInput, () => repository.listVaults()),
    inventory_create_vault: command(
      z.object({ input: z.object({ name: string }) }),
      ({ input }) => repository.createVault(input),
    ),
    inventory_update_vault: command(
      z.object({ input: z.object({ id: string, name: string }) }),
      ({ input }) => repository.updateVault(input),
    ),
    inventory_delete_vault: command(idInput, ({ id }) => repository.deleteVault(id)),
    inventory_list_groups: command(
      vaultIdInput,
      ({ vaultId }) => repository.listGroups(vaultId),
    ),
    inventory_create_group: command(
      z.object({
        input: z.object({
          vaultId: string,
          parentId: optionalString,
          name: string,
          color: optionalString,
        }),
      }),
      ({ input }) => repository.createGroup(input),
    ),
    inventory_list_hosts: command(
      vaultIdInput,
      ({ vaultId }) => repository.listHosts(vaultId),
    ),
    inventory_create_host: command(
      z.object({ input: createHost }),
      ({ input }) => repository.createHost(input),
    ),
    inventory_update_host: command(
      z.object({ input: updateHost }),
      ({ input }) => repository.updateHost(input),
    ),
    inventory_delete_host: command(idInput, ({ id }) => repository.deleteHost(id)),
    inventory_list_identities: command(
      vaultIdInput,
      ({ vaultId }) => repository.listIdentities(vaultId),
    ),
    inventory_create_identity: command(
      z.object({ input: z.object(identityBase) }),
      ({ input }) => repository.createIdentity(input),
    ),
    inventory_update_identity: command(
      z.object({ input: z.object({ id: string, ...identityBase }) }),
      ({ input }) => repository.updateIdentity(input),
    ),
    inventory_delete_identity: command(
      idInput,
      ({ id }) => repository.deleteIdentity(id),
    ),
  };
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input) => Output,
): CommandHandler {
  return (rawInput) => {
    try {
      const input = schema.parse(rawInput ?? {});
      return success(operation(input));
    } catch (error) {
      if (error instanceof DomainError) return error.toResult();
      if (error instanceof ZodError) {
        return failure(
          "IPC_INVALID_INPUT",
          "The desktop operation received invalid input.",
        );
      }
      throw error;
    }
  };
}
