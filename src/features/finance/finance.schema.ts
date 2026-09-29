import { z } from "zod";

export const verifyPaymentSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
  status: z.literal("approved").or(z.literal("rejected")),
  notes: z.string().optional(),
});

export const verifyRequirementSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
  type: z.literal("twibbon").or(z.literal("story")),
  status: z.literal("approved").or(z.literal("rejected")),
  notes: z.string().optional(),
});
