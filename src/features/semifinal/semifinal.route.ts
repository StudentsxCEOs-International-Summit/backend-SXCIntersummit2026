import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import * as SemifinalController from "./semifinal.controller";
import { submitScoreSchema, publishResultsSchema } from "./semifinal.schema";

const semifinalRouter = Router();

// ADMIN-03: Submit / update a semifinal score
semifinalRouter.post(
  "/score",
  requireAuth,
  requireAdmin,
  validateRequest({ body: submitScoreSchema }),
  SemifinalController.submitScore,
);

// Get all semifinal scores (admin leaderboard)
semifinalRouter.get(
  "/scores",
  requireAuth,
  requireAdmin,
  SemifinalController.getScores,
);

// IBCC-10: Publish semifinal results & send emails
semifinalRouter.post(
  "/publish-results",
  requireAuth,
  requireAdmin,
  validateRequest({ body: publishResultsSchema }),
  SemifinalController.publishResults,
);

export default semifinalRouter;
