import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import * as AccessCodeController from "./accesscode.controller";
import { generateAccessCodeSchema, semifinalLoginSchema } from "./accesscode.schema";

const accessCodeRouter = Router();

// IBCC-07: Generate access code (admin only)
accessCodeRouter.post(
  "/generate",
  requireAuth,
  requireAdmin,
  validateRequest({ body: generateAccessCodeSchema }),
  AccessCodeController.generateAccessCode,
);

// IBCC-08: Login to semifinal with team ID + access code (public)
accessCodeRouter.post(
  "/login",
  validateRequest({ body: semifinalLoginSchema }),
  AccessCodeController.loginWithAccessCode,
);

export default accessCodeRouter;
