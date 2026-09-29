import { z } from "zod";

export const uploadPaymentSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
});

export const uploadRequirementSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
  type: z.literal("twibbon").or(z.literal("story")),
});

export const uploadSlidesSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
});
