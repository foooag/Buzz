import type { InventoryApi } from "./inventoryApi";
import type { Group, Host, Identity, Vault } from "../../shared/types";

type Snapshot = { vaults: Vault[]; groups: Group[]; hosts: Host[]; identities: Identity[] };
const storageKey = "terminus.e2e.inventory";

export function createDeterministicInventoryApi(): InventoryApi {
  const read = (): Snapshot => JSON.parse(localStorage.getItem(storageKey) ?? '{"vaults":[],"groups":[],"hosts":[],"identities":[]}') as Snapshot;
  const write = (snapshot: Snapshot) => localStorage.setItem(storageKey, JSON.stringify(snapshot));
  const timestamp = () => new Date().toISOString();

  return {
    async listVaults() { return read().vaults; },
    async createVault(input) {
      const snapshot = read(); const time = timestamp();
      const vault = { id: crypto.randomUUID(), name: input.name, createdAt: time, updatedAt: time };
      snapshot.vaults.push(vault); write(snapshot); return vault;
    },
    async updateVault(input) {
      const snapshot = read(); const vault = snapshot.vaults.find((item) => item.id === input.id);
      if (!vault) throw { code: "INVENTORY_NOT_FOUND" };
      vault.name = input.name; vault.updatedAt = timestamp(); write(snapshot); return vault;
    },
    async deleteVault(id) {
      const snapshot = read(); snapshot.vaults = snapshot.vaults.filter((item) => item.id !== id);
      snapshot.groups = snapshot.groups.filter((item) => item.vaultId !== id);
      snapshot.hosts = snapshot.hosts.filter((item) => item.vaultId !== id);
      snapshot.identities = snapshot.identities.filter((item) => item.vaultId !== id); write(snapshot);
    },
    async listGroups(vaultId) { return read().groups.filter((item) => item.vaultId === vaultId); },
    async createGroup(input) {
      const snapshot = read(); const time = timestamp();
      const group = { id: crypto.randomUUID(), ...input, createdAt: time, updatedAt: time };
      snapshot.groups.push(group); write(snapshot); return group;
    },
    async listHosts(vaultId) { return read().hosts.filter((item) => item.vaultId === vaultId); },
    async createHost(input) {
      const snapshot = read(); const time = timestamp();
      const host = { id: crypto.randomUUID(), ...input, createdAt: time, updatedAt: time };
      snapshot.hosts.push(host); write(snapshot); return host;
    },
    async updateHost(input) {
      const snapshot = read(); const index = snapshot.hosts.findIndex((item) => item.id === input.id);
      if (index < 0) throw { code: "INVENTORY_NOT_FOUND" };
      const host = { ...snapshot.hosts[index], ...input, updatedAt: timestamp() };
      snapshot.hosts[index] = host; write(snapshot); return host;
    },
    async deleteHost(id) { const snapshot = read(); snapshot.hosts = snapshot.hosts.filter((item) => item.id !== id); write(snapshot); },
    async listIdentities(vaultId) { return read().identities.filter((item) => item.vaultId === vaultId); },
    async createIdentity(input) {
      const snapshot = read(); const time = timestamp();
      const identity = { id: crypto.randomUUID(), ...input, createdAt: time, updatedAt: time };
      snapshot.identities.push(identity); write(snapshot); return identity;
    },
    async updateIdentity(input) {
      const snapshot = read();
      const index = snapshot.identities.findIndex((item) => item.id === input.id);
      if (index < 0) throw { code: "INVENTORY_NOT_FOUND" };
      const identity = { ...snapshot.identities[index], ...input, updatedAt: timestamp() };
      snapshot.identities[index] = identity;
      write(snapshot);
      return identity;
    },
    async deleteIdentity(id) {
      const snapshot = read();
      snapshot.identities = snapshot.identities.filter((item) => item.id !== id);
      write(snapshot);
    },
  };
}
