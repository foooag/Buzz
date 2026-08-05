import { z } from "zod";

const forwardKindSchema = z.enum(["local", "remote", "dynamic"]);

export const portForwardRuleSchema = z
  .object({
    id: z.string().min(1),
    hostId: z.string().min(1),
    kind: forwardKindSchema,
    bindHost: z.string().min(1),
    bindPort: z.number().int().min(1).max(65535),
    targetHost: z.string().min(1).nullable(),
    targetPort: z.number().int().min(1).max(65535).nullable(),
    label: z.string().nullable().default(null),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((rule, context) => {
    if (rule.kind !== "dynamic") {
      if (!rule.targetHost) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetHost"],
          message: "Local and remote forwards require a target host.",
        });
      }
      if (rule.targetPort === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetPort"],
          message: "Local and remote forwards require a target port.",
        });
      }
    }
  });

export const portForwardRuleListSchema = z.array(portForwardRuleSchema);
export const activeForwardIdListSchema = z.array(z.string());
