import { z } from "zod";

export const submitScoreSchema = z.object({
  teamId: z.coerce.number().int().positive("teamId must be a positive integer"),
  score: z.coerce.number().min(0, "Score must be >= 0").max(100, "Score must be <= 100"),
  comment: z.string().max(500).optional(),
});

export const publishResultsSchema = z.object({
  qualifiedTeamIds: z.array(z.coerce.number().int().positive()).min(1, "At least 1 qualified team is required"),
});
