import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import * as FinanceController from "./finance.controller";
import { verifyPaymentSchema, verifyRequirementSchema } from "./finance.schema";

const financeRouter = Router();

// ADMIN-02: Verify payment proof
financeRouter.post(
  "/verify",
  requireAuth,
  requireAdmin,
  validateRequest({ body: verifyPaymentSchema }),
  FinanceController.verifyPayment,
);

// Verify requirement (twibbon / story)
financeRouter.post(
  "/requirement/verify",
  requireAuth,
  requireAdmin,
  validateRequest({ body: verifyRequirementSchema }),
  FinanceController.verifyRequirement,
);

export default financeRouter;
