import { create } from "zustand";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { Group, Host, Identity, InventoryErrorCode, Vault } from "../../shared/types";

export type InventoryStatus = "idle" | "loading" | "ready" | "error";
export type InventoryStore = {
  vaults: Record<string, Vault>;
  vaultOrder: string[];
  groups: Record<string, Group>;
  hosts: Record<string, Host>;
  identities: Record<string, Identity>;
  activeVaultId: string | null;
  status: InventoryStatus;
  errorCode: InventoryErrorCode | null;
  beginLoad: () => void;
  setVaults: (vaults: Vault[]) => void;
  activateVault: (id: string) => void;
  setResources: (groups: Group[], hosts: Host[], identities: Identity[]) => void;
  upsertHost: (host: Host) => void;
  setIdentities: (identities: Identity[]) => void;
  fail: (code: InventoryErrorCode) => void;
};

const stateCreator: StateCreator<InventoryStore> = (set, get) => ({
  vaults: {}, vaultOrder: [], groups: {}, hosts: {}, identities: {},
  activeVaultId: null, status: "idle", errorCode: null,
  beginLoad: () => set({ status: "loading", errorCode: null }),
  setVaults: (vaults) => set((state) => ({
    vaults: Object.fromEntries(vaults.map((vault) => [vault.id, vault])),
    vaultOrder: vaults.map((vault) => vault.id),
    activeVaultId: state.activeVaultId && vaults.some((vault) => vault.id === state.activeVaultId)
      ? state.activeVaultId : (vaults[0]?.id ?? null),
    status: "ready", errorCode: null,
  })),
  activateVault: (id) => { if (get().vaults[id]) set({ activeVaultId: id }); },
  setResources: (groups, hosts, identities) => set({
    groups: Object.fromEntries(groups.map((item) => [item.id, item])),
    hosts: Object.fromEntries(hosts.map((item) => [item.id, item])),
    identities: Object.fromEntries(identities.map((item) => [item.id, item])),
    status: "ready", errorCode: null,
  }),
  upsertHost: (host) => set((state) => ({
    hosts: { ...state.hosts, [host.id]: host },
    errorCode: null,
  })),
  setIdentities: (identities) => set({
    identities: Object.fromEntries(identities.map((item) => [item.id, item])),
    status: "ready",
    errorCode: null,
  }),
  fail: (errorCode) => set({ status: "error", errorCode }),
});

export function createInventoryStore() { return createStore<InventoryStore>()(stateCreator); }
export const useInventoryStore = create<InventoryStore>()(stateCreator);
