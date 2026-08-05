import { callCommand } from "../../app/ipc";
import {
  groupListSchema, hostListSchema, hostSchema, identityListSchema, identitySchema,
  vaultListSchema, vaultSchema, groupSchema,
} from "../../shared/schemas";
import type {
  CreateGroupInput, CreateHostInput, CreateIdentityInput, CreateVaultInput, Group, Host,
  Identity, UpdateHostInput, UpdateIdentityInput, UpdateVaultInput, Vault,
} from "../../shared/types";

export type InventoryApi = {
  listVaults(): Promise<Vault[]>;
  createVault(input: CreateVaultInput): Promise<Vault>;
  updateVault(input: UpdateVaultInput): Promise<Vault>;
  deleteVault(id: string): Promise<void>;
  listGroups(vaultId: string): Promise<Group[]>;
  createGroup(input: CreateGroupInput): Promise<Group>;
  listHosts(vaultId: string): Promise<Host[]>;
  createHost(input: CreateHostInput): Promise<Host>;
  updateHost(input: UpdateHostInput): Promise<Host>;
  deleteHost(id: string): Promise<void>;
  listIdentities(vaultId: string): Promise<Identity[]>;
  createIdentity(input: CreateIdentityInput): Promise<Identity>;
  updateIdentity(input: UpdateIdentityInput): Promise<Identity>;
  deleteIdentity(id: string): Promise<void>;
};

async function parsed<T>(command: string, args: object, schema: { parse(value: unknown): T }) {
  return schema.parse(await callCommand<object, unknown>(command, args));
}

export const inventoryApi: InventoryApi = {
  listVaults: () => parsed("inventory_list_vaults", {}, vaultListSchema),
  createVault: (input) => parsed("inventory_create_vault", { input }, vaultSchema),
  updateVault: (input) => parsed("inventory_update_vault", { input }, vaultSchema),
  deleteVault: (id) => callCommand("inventory_delete_vault", { id }),
  listGroups: (vaultId) => parsed("inventory_list_groups", { vaultId }, groupListSchema),
  createGroup: (input) => parsed("inventory_create_group", { input }, groupSchema),
  listHosts: (vaultId) => parsed("inventory_list_hosts", { vaultId }, hostListSchema),
  createHost: (input) => parsed("inventory_create_host", { input }, hostSchema),
  updateHost: (input) => parsed("inventory_update_host", { input }, hostSchema),
  deleteHost: (id) => callCommand("inventory_delete_host", { id }),
  listIdentities: (vaultId) => parsed("inventory_list_identities", { vaultId }, identityListSchema),
  createIdentity: (input) => parsed("inventory_create_identity", { input }, identitySchema),
  updateIdentity: (input) => parsed("inventory_update_identity", { input }, identitySchema),
  deleteIdentity: (id) => callCommand("inventory_delete_identity", { id }),
};
