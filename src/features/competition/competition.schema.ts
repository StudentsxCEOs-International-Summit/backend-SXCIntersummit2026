import { z } from 'zod';

export const updatePreliminaryStatusSchema = z.object({
  status: z.literal('passed').or(z.literal('failed')),
  feedback: z.string().optional(),
  score: z.coerce.number().min(0, "Score cannot be negative").max(100, "Score cannot exceed 100").optional(),
});

export const teamIdParamSchema = z.object({
  teamId: z.coerce.number().int().positive('teamId must be a positive integer'),
});
