import { randomUUID } from "node:crypto";
import { DomainError } from "../../ipc/domain-error.js";

export type Vault = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupColor = "coral" | "teal" | "violet" | "lime" | "fog";

export type Group = {
  id: string;
  vaultId: string;
  parentId: string | null;
  name: string;
  color?: GroupColor;
  createdAt: string;
  updatedAt: string;
};

export type HostProtocol = "ssh" | "telnet" | "serial";
export type HostAuthKind = "password" | "privateKey";
export type HostStatus = "online" | "offline" | "connecting" | "failed";

export type Host = {
  id: string;
  vaultId: string;
  groupId: string | null;
  name: string;
  address: string;
  username: string;
  tags: string[];
  notes: string;
  authKind?: HostAuthKind;
  credentialRef?: string;
  startupCommands: string[];
  protocol?: HostProtocol;
  port?: number;
  baudRate?: number;
  identity?: string;
  jumpHost?: string;
  proxy?: string;
  env: Record<string, string>;
  startupSnippets: string[];
  status?: HostStatus;
  label: string;
  lastConnected: string;
  createdAt: string;
  updatedAt: string;
};

export type Identity = {
  id: string;
  vaultId: string;
  name: string;
  username: string;
  type?: string;
  algorithm?: string;
  passphrase?: boolean;
  expires?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateVault = { name: string };
export type UpdateVault = { id: string; name: string };
export type CreateGroup = {
  vaultId: string;
  parentId?: string | null;
  name: string;
  color?: string | null;
};

export type CreateHost = {
  vaultId: string;
  groupId?: string | null;
  name: string;
  address: string;
  username?: string;
  tags?: string[];
  notes?: string;
  authKind?: string | null;
  credentialRef?: string | null;
  startupCommands?: string[];
  protocol?: string | null;
  port?: number | null;
  baudRate?: number | null;
  identity?: string | null;
  jumpHost?: string | null;
  proxy?: string | null;
  env?: Record<string, string>;
  startupSnippets?: string[];
  status?: string | null;
  label?: string;
  lastConnected?: string;
};

export type UpdateHost = CreateHost & { id: string };

export type CreateIdentity = {
  vaultId: string;
  name: string;
  username?: string;
  type?: string | null;
  algorithm?: string | null;
  passphrase?: boolean | null;
  expires?: string | null;
};

export type UpdateIdentity = CreateIdentity & { id: string };

export type ModelFactory = {
  id: () => string;
  now: () => string;
};

const defaultFactory: ModelFactory = {
  id: randomUUID,
  now: () => new Date().toISOString(),
};

export function createVault(input: CreateVault, factory = defaultFactory): Vault {
  const timestamp = factory.now();
  return {
    id: factory.id(),
    name: required(input.name, "Vault name"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createGroup(input: CreateGroup, factory = defaultFactory): Group {
  const timestamp = factory.now();
  const color = enumValue(
    input.color,
    ["coral", "teal", "violet", "lime", "fog"] as const,
    "Group color is invalid.",
  );
  return {
    id: factory.id(),
    vaultId: required(input.vaultId, "Vault id"),
    parentId: optionalString(input.parentId) ?? null,
    name: required(input.name, "Group name"),
    ...(color ? { color } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createHost(input: CreateHost, factory = defaultFactory): Host {
  const timestamp = factory.now();
  const protocol = enumValue(
    input.protocol,
    ["ssh", "telnet", "serial"] as const,
    "Host protocol is invalid.",
  );
  const authKind = enumValue(
    input.authKind,
    ["password", "privateKey"] as const,
    "Host authentication type is invalid.",
  );
  const status = enumValue(
    input.status,
    ["online", "offline", "connecting", "failed"] as const,
    "Host status is invalid.",
  );
  const port = normalizePort(protocol, input.port);
  const baudRate = normalizePositiveInteger(input.baudRate, 0xffff_ffff);

  return {
    id: factory.id(),
    vaultId: required(input.vaultId, "Vault id"),
    groupId: optionalString(input.groupId) ?? null,
    name: required(input.name, "Host name"),
    address: required(input.address, "Host address"),
    username: optionalText(input.username),
    tags: normalizeTags(input.tags ?? []),
    notes: optionalText(input.notes),
    ...(authKind ? { authKind } : {}),
    ...optionalProperty("credentialRef", input.credentialRef),
    startupCommands: normalizeCommands(input.startupCommands ?? []),
    ...(protocol ? { protocol } : {}),
    ...(port === undefined ? {} : { port }),
    ...(baudRate === undefined ? {} : { baudRate }),
    ...optionalProperty("identity", input.identity),
    ...optionalProperty("jumpHost", input.jumpHost),
    ...optionalProperty("proxy", input.proxy),
    env: normalizeEnvironment(input.env ?? {}),
    startupSnippets: normalizeCommands(input.startupSnippets ?? []),
    ...(status ? { status } : {}),
    label: optionalText(input.label),
    lastConnected: optionalText(input.lastConnected),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createIdentity(input: CreateIdentity, factory = defaultFactory): Identity {
  const timestamp = factory.now();
  return {
    id: factory.id(),
    vaultId: required(input.vaultId, "Vault id"),
    name: required(input.name, "Identity name"),
    username: optionalText(input.username),
    ...optionalProperty("type", input.type),
    ...optionalProperty("algorithm", input.algorithm),
    ...(typeof input.passphrase === "boolean" ? { passphrase: input.passphrase } : {}),
    ...optionalProperty("expires", input.expires),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function required(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw validationError(`${label} is required.`);
  return normalized;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown): string | undefined {
  const normalized = optionalText(value);
  return normalized || undefined;
}

function optionalProperty<Key extends string>(
  key: Key,
  value: unknown,
): Partial<Record<Key, string>> {
  const normalized = optionalString(value);
  return normalized ? { [key]: normalized } as Record<Key, string> : {};
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  message: string,
): Values[number] | undefined {
  const normalized = optionalString(value);
  if (!normalized) return undefined;
  if (!isOneOf(normalized, values)) throw validationError(message);
  return normalized;
}

function isOneOf<const Values extends readonly string[]>(
  value: string,
  values: Values,
): value is Values[number] {
  return values.includes(value);
}

function normalizePort(
  protocol: HostProtocol | undefined,
  value: number | null | undefined,
): number | undefined {
  if (protocol === "serial" || value == null) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw validationError("Host port is invalid.");
  }
  return value;
}

function normalizePositiveInteger(
  value: number | null | undefined,
  maximum: number,
): number | undefined {
  if (value == null || value <= 0) return undefined;
  if (!Number.isInteger(value) || value > maximum) {
    throw validationError("Host baud rate is invalid.");
  }
  return value;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const candidate of tags) {
    const tag = optionalText(candidate);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

function normalizeCommands(commands: string[]): string[] {
  return commands.map(optionalText).filter(Boolean);
}

function normalizeEnvironment(environment: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment)
      .map(([key, value]) => [key.trim(), value] as const)
      .filter(([key]) => Boolean(key)),
  );
}

function validationError(message: string): DomainError {
  return new DomainError("INVENTORY_VALIDATION_FAILED", message);
}
