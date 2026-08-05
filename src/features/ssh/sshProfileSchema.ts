import { z } from "zod";

export const sshProfileDraftSchema = z.object({
  hostId: z.string().trim().min(1),
  hostname: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().min(1),
  authKind: z.enum(["password", "privateKey"]),
}).strict();
