import { COMMANDS } from "@shared/ipc/command-names";
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
  listVaults: () => parsed(COMMANDS.inventoryListVaults, {}, vaultListSchema),
  createVault: (input) => parsed(COMMANDS.inventoryCreateVault, { input }, vaultSchema),
  updateVault: (input) => parsed(COMMANDS.inventoryUpdateVault, { input }, vaultSchema),
  deleteVault: (id) => callCommand(COMMANDS.inventoryDeleteVault, { id }),
  listGroups: (vaultId) => parsed(COMMANDS.inventoryListGroups, { vaultId }, groupListSchema),
  createGroup: (input) => parsed(COMMANDS.inventoryCreateGroup, { input }, groupSchema),
  listHosts: (vaultId) => parsed(COMMANDS.inventoryListHosts, { vaultId }, hostListSchema),
  createHost: (input) => parsed(COMMANDS.inventoryCreateHost, { input }, hostSchema),
  updateHost: (input) => parsed(COMMANDS.inventoryUpdateHost, { input }, hostSchema),
  deleteHost: (id) => callCommand(COMMANDS.inventoryDeleteHost, { id }),
  listIdentities: (vaultId) => parsed(COMMANDS.inventoryListIdentities, { vaultId }, identityListSchema),
  createIdentity: (input) => parsed(COMMANDS.inventoryCreateIdentity, { input }, identitySchema),
  updateIdentity: (input) => parsed(COMMANDS.inventoryUpdateIdentity, { input }, identitySchema),
  deleteIdentity: (id) => callCommand(COMMANDS.inventoryDeleteIdentity, { id }),
};
