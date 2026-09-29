import { z } from "zod";

export const generateAccessCodeSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
});

export const semifinalLoginSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
  accessCode: z.string().length(8, "Access code must be exactly 8 characters"),
});
