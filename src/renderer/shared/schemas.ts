import { z } from "zod";

const id = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const required = z.string().trim().min(1);
const optionalText = z.string().trim();
const timestampFields = { createdAt: timestamp, updatedAt: timestamp };

const optionalNumber = z.number().nullable().optional();
const hostExtras = {
  protocol: z.enum(["ssh", "telnet", "serial"]).optional(),
  port: optionalNumber,
  baudRate: optionalNumber,
  authKind: z.enum(["password", "privateKey"]).optional(),
  credentialRef: z.string().nullable().optional(),
  identity: z.string().nullable().optional(),
  jumpHost: z.string().nullable().optional(),
  proxy: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()).optional(),
  startupSnippets: z.array(z.string()).optional(),
  startupCommands: z.array(z.string()).optional(),
  status: z.enum(["online", "offline", "connecting", "failed"]).optional(),
  label: z.string().optional(),
  lastConnected: z.string().optional(),
};

export const vaultSchema = z
  .object({ id, name: required, ...timestampFields })
  .strict();
export const groupSchema = z
  .object({
    id,
    vaultId: id,
    parentId: id.nullable(),
    name: required,
    color: z.enum(["coral", "teal", "violet", "lime", "fog"]).optional(),
    count: z.number().optional(),
    ...timestampFields,
  })
  .strict();
export const hostSchema = z
  .object({
    id,
    vaultId: id,
    groupId: id.nullable(),
    name: required,
    address: required,
    username: optionalText,
    tags: z.array(z.string()),
    notes: optionalText,
    ...hostExtras,
    ...timestampFields,
  })
  .strict();
export const identitySchema = z
  .object({
    id,
    vaultId: id,
    name: required,
    username: optionalText,
    type: z.string().optional(),
    algorithm: z.string().optional(),
    fingerprint: z.string().optional(),
    attached: z.number().optional(),
    passphrase: z.boolean().optional(),
    expires: z.string().optional(),
    ...timestampFields,
  })
  .strict();

const normalizedTags = z.array(z.string()).transform((tags) => {
  const seen = new Set<string>();
  return tags.flatMap((candidate) => {
    const tag = candidate.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return [];
    seen.add(key);
    return [tag];
  });
});

export const createVaultInputSchema = z.object({ name: required }).strict();
export const createHostInputSchema = z
  .object({
    vaultId: id,
    groupId: id.nullable(),
    name: required,
    address: required,
    username: optionalText,
    tags: normalizedTags,
    notes: optionalText,
    ...hostExtras,
  })
  .strict();

const identityExtras = {
  type: z.string().optional(),
  algorithm: z.string().optional(),
  passphrase: z.boolean().optional(),
  expires: z.string().optional(),
};
export const createIdentityInputSchema = z
  .object({ vaultId: id, name: required, username: optionalText, ...identityExtras })
  .strict();
export const updateIdentityInputSchema = z
  .object({ id, vaultId: id, name: required, username: optionalText, ...identityExtras })
  .strict();

export const vaultListSchema = z.array(vaultSchema);
export const groupListSchema = z.array(groupSchema);
export const hostListSchema = z.array(hostSchema);
export const identityListSchema = z.array(identitySchema);
