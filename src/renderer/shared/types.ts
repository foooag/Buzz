export type ResourceId = string;
export type Timestamped = { createdAt: string; updatedAt: string };
export type Vault = Timestamped & { id: ResourceId; name: string };
export type GroupColor = "coral" | "teal" | "violet" | "lime" | "fog";
export type Group = Timestamped & {
  id: ResourceId;
  vaultId: ResourceId;
  parentId: ResourceId | null;
  name: string;
  color?: GroupColor;
  count?: number;
};
export type HostProtocol = "ssh" | "telnet" | "serial";
export type HostStatus = "online" | "offline" | "connecting" | "failed";
export type HostAuthKind = "password" | "privateKey";
export type Host = Timestamped & {
  id: ResourceId;
  vaultId: ResourceId;
  groupId: ResourceId | null;
  name: string;
  address: string;
  username: string;
  tags: string[];
  notes: string;
  // Rich connection config (populated by the prototype seed; the real Rust
  // backend ignores unknown serde fields, so these stay optional on the wire).
  protocol?: HostProtocol;
  port?: number | null;
  baudRate?: number | null;
  authKind?: HostAuthKind;
  credentialRef?: string | null;
  identity?: string | null;
  jumpHost?: string | null;
  proxy?: string | null;
  env?: Record<string, string>;
  startupSnippets?: string[];
  startupCommands?: string[];
  status?: HostStatus;
  label?: string;
  lastConnected?: string;
};
export type Identity = Timestamped & {
  id: ResourceId;
  vaultId: ResourceId;
  name: string;
  username: string;
  type?: string;
  algorithm?: string;
  fingerprint?: string;
  attached?: number;
  passphrase?: boolean;
  expires?: string;
};
export type CreateVaultInput = { name: string };
export type UpdateVaultInput = CreateVaultInput & { id: ResourceId };
export type CreateGroupInput = {
  vaultId: ResourceId;
  parentId: ResourceId | null;
  name: string;
  color?: GroupColor;
};
export type CreateHostInput = Omit<Host, "id" | "createdAt" | "updatedAt">;
export type UpdateHostInput = CreateHostInput & { id: ResourceId };
export type CreateIdentityInput = {
  vaultId: ResourceId;
  name: string;
  username: string;
  type?: string;
  algorithm?: string;
  passphrase?: boolean;
  expires?: string;
};
export type UpdateIdentityInput = {
  id: ResourceId;
  vaultId: ResourceId;
  name: string;
  username: string;
  type?: string;
  algorithm?: string;
  passphrase?: boolean;
  expires?: string;
};
export type InventoryErrorCode =
  | "INVENTORY_VALIDATION_FAILED"
  | "INVENTORY_NOT_FOUND"
  | "INVENTORY_CONFLICT"
  | "INVENTORY_STORAGE_FAILED"
  | "VAULT_KEY_UNAVAILABLE"
  | "VAULT_DECRYPTION_FAILED"
  | "INVENTORY_MIGRATION_FAILED";
