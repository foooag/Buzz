import type { Group, Host, Identity, Vault } from "../../shared/types";
import type { InventoryApi } from "./inventoryApi";

const timestamp = "2026-07-25T09:14:02.000Z";
const vault: Vault = {
  id: "vault-local",
  name: "Local vault",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const groups: Group[] = [
  { id: "g-prod", vaultId: vault.id, parentId: null, name: "Production", color: "coral", count: 4, createdAt: timestamp, updatedAt: timestamp },
  { id: "g-stage", vaultId: vault.id, parentId: null, name: "Staging", color: "teal", count: 2, createdAt: timestamp, updatedAt: timestamp },
  { id: "g-db", vaultId: vault.id, parentId: null, name: "Databases", color: "violet", count: 3, createdAt: timestamp, updatedAt: timestamp },
  { id: "g-edge", vaultId: vault.id, parentId: null, name: "Edge & Network", color: "lime", count: 3, createdAt: timestamp, updatedAt: timestamp },
];

// Mirrors designs/terminal-ai-mode/inventory.jsx — sanitized demo data.
// Tuple order: [name, address, username, group, protocol, port, identity,
//   tags, status, label, jumpHost, lastConnected]
type HostSeed = [
  name: string,
  address: string,
  username: string,
  group: string,
  protocol: Host["protocol"],
  port: number | null,
  identity: string | null,
  tags: string[],
  status: Host["status"],
  label: string,
  jumpHost: string | null,
  lastConnected: string,
];

const hostSeed: HostSeed[] = [
  ["web-prod-01", "10.0.0.10", "ubuntu", "g-prod", "ssh", 22, "deploy-ed25519", ["web", "nginx", "shop"], "online", "Nginx · shop frontend", "bastion-jump", "2m ago"],
  ["web-prod-02", "10.0.0.11", "ubuntu", "g-prod", "ssh", 22, "deploy-ed25519", ["web", "nginx"], "online", "Nginx · shop frontend", "bastion-jump", "1h ago"],
  ["api-prod-01", "10.0.0.20", "deploy", "g-prod", "ssh", 22, "deploy-ed25519", ["api", "gunicorn"], "offline", "Gunicorn API", "bastion-jump", "3d ago"],
  ["bastion-jump", "203.0.113.10", "bridge", "g-prod", "ssh", 2200, "bridge-ed25519", ["bastion", "jump"], "online", "Bastion / jump host", null, "just now"],
  ["db-primary", "10.0.2.5", "postgres", "g-db", "ssh", 22, "db-rsa", ["postgres", "primary"], "online", "Postgres primary", "bastion-jump", "12m ago"],
  ["db-replica-02", "10.0.2.6", "postgres", "g-db", "ssh", 22, "db-rsa", ["postgres", "replica"], "online", "Postgres replica", "bastion-jump", "12m ago"],
  ["redis-cache-01", "10.0.2.20", "redis", "g-db", "ssh", 22, "deploy-ed25519", ["redis", "cache"], "offline", "Redis cache", "bastion-jump", "5d ago"],
  ["stage-app-01", "10.0.4.10", "ubuntu", "g-stage", "ssh", 22, "deploy-ed25519", ["web", "staging"], "online", "Staging frontend", "bastion-jump", "yesterday"],
  ["stage-worker", "10.0.4.11", "ubuntu", "g-stage", "ssh", 22, "deploy-ed25519", ["worker", "staging"], "offline", "Background worker", "bastion-jump", "2d ago"],
  ["router-edge-01", "10.0.7.1", "admin", "g-edge", "ssh", 22, "net-ed25519", ["router", "edge"], "online", "Edge router", null, "4h ago"],
  ["switch-core-01", "10.0.7.2", "admin", "g-edge", "telnet", 23, null, ["switch", "core"], "offline", "Core switch (Telnet)", null, "1w ago"],
  ["serial-console", "/dev/tty.usbserial-AB0", "", "g-edge", "serial", null, null, ["serial", "console"], "offline", "Serial console · 115200 8N1", null, "never"],
];

const startupByHost: Record<string, string[]> = {
  "web-prod-01": ["s-tail-log", "s-status"],
  "db-primary": ["s-pg-stat"],
};
const envByHost: Record<string, Record<string, string>> = {
  "web-prod-01": { NODE_ENV: "production", SHOP_ENV: "prod" },
  "stage-app-01": { NODE_ENV: "staging" },
};

const hosts: Host[] = hostSeed.map(([name, address, username, groupId, protocol, port, identity, tags, status, label, jumpHost, lastConnected], index) => ({
  id: `host-${index + 1}`,
  vaultId: vault.id,
  groupId,
  name,
  address,
  username,
  tags: [...tags],
  notes: label,
  protocol,
  port,
  baudRate: protocol === "serial" ? 115200 : null,
  authKind: identity ? "privateKey" : "password",
  identity,
  jumpHost,
  proxy: null,
  env: envByHost[name] ?? {},
  startupSnippets: startupByHost[name] ?? [],
  status,
  label,
  lastConnected,
  createdAt: timestamp,
  updatedAt: timestamp,
}));

const identities: Identity[] = [
  { id: "id-deploy", vaultId: vault.id, name: "deploy-ed25519", username: "", type: "SSH key", algorithm: "ed25519", fingerprint: "SHA256:9X2…f0q", attached: 6, passphrase: true, createdAt: timestamp, updatedAt: timestamp },
  { id: "id-bridge", vaultId: vault.id, name: "bridge-ed25519", username: "", type: "SSH key", algorithm: "ed25519", fingerprint: "SHA256:Lp7…3aZ", attached: 1, passphrase: false, createdAt: timestamp, updatedAt: timestamp },
  { id: "id-db", vaultId: vault.id, name: "db-rsa", username: "", type: "SSH key", algorithm: "rsa-4096", fingerprint: "SHA256:2cD…8wE", attached: 2, passphrase: true, createdAt: timestamp, updatedAt: timestamp },
  { id: "id-net", vaultId: vault.id, name: "net-ed25519", username: "", type: "SSH key", algorithm: "ed25519", fingerprint: "SHA256:Qw1…7nK", attached: 1, passphrase: false, createdAt: timestamp, updatedAt: timestamp },
  { id: "id-cert", vaultId: vault.id, name: "prod-cert (signed)", username: "", type: "SSH certificate", algorithm: "ed25519-cert", fingerprint: "SHA256:Tt0…9rB", attached: 0, passphrase: false, expires: "2026-08-09", createdAt: timestamp, updatedAt: timestamp },
];

// Snippets aren't part of the InventoryApi surface; exported for the host
// detail panel + host form (startup snippets multi-select).
export const PROTOTYPE_SNIPPETS = [
  { id: "s-tail-log", name: "Tail nginx access log", command: "tail -f /var/log/nginx/access.log" },
  { id: "s-status", name: "Service status", command: "systemctl status gunicorn --no-pager" },
  { id: "s-pg-stat", name: "Postgres active queries", command: "SELECT * FROM pg_stat_activity WHERE state='active';" },
  { id: "s-disk", name: "Disk usage top-level", command: "du -sh /* 2>/dev/null | sort -h" },
  { id: "s-docker", name: "Docker ps", command: "docker ps --format 'table {{.Names}}\t{{.Status}}'" },
  { id: "s-listen", name: "Listening ports", command: "ss -tlnp" },
  { id: "s-cpu", name: "Top CPU processes", command: "ps aux --sort=-%cpu | head -n 12" },
  { id: "s-cert", name: "TLS cert expiry", command: "echo | openssl s_client -connect :443 2>/dev/null | openssl x509 -noout -dates" },
];

export function createPrototypeInventoryApi(): InventoryApi {
  return {
    async listVaults() { return [vault]; },
    async createVault(input) { return { ...vault, name: input.name }; },
    async updateVault(input) { return { ...vault, ...input }; },
    async deleteVault() {},
    async listGroups(vaultId) { return groups.filter((group) => group.vaultId === vaultId); },
    async createGroup(input) {
      return { id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp };
    },
    async listHosts(vaultId) { return hosts.filter((host) => host.vaultId === vaultId); },
    async createHost(input) {
      return { id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp };
    },
    async updateHost(input) {
      const current = hosts.find((host) => host.id === input.id);
      if (!current) throw { code: "INVENTORY_NOT_FOUND" };
      return { ...current, ...input, updatedAt: timestamp };
    },
    async deleteHost() {},
    async listIdentities(vaultId) { return identities.filter((identity) => identity.vaultId === vaultId); },
    async createIdentity(input) {
      return { id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp };
    },
    async updateIdentity(input) {
      const current = identities.find((identity) => identity.id === input.id);
      if (!current) throw { code: "INVENTORY_NOT_FOUND" };
      return { ...current, ...input, updatedAt: timestamp };
    },
    async deleteIdentity() {},
  };
}
