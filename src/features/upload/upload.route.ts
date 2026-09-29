import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { uploadPayment, uploadRequirement, uploadSlides } from "../../services/storage.service";
import * as UploadController from "./upload.controller";

const uploadRouter = Router();

// IBCC-06: Upload payment proof
uploadRouter.post(
  "/payment",
  requireAuth,
  uploadPayment.single("file"),
  UploadController.uploadPaymentProof,
);

// Upload requirement (twibbon / story)
uploadRouter.post(
  "/requirement",
  requireAuth,
  uploadRequirement.single("file"),
  UploadController.uploadRequirementProof,
);

// IBCC-09: Upload 5-slide deck
uploadRouter.post(
  "/slides",
  requireAuth,
  uploadSlides.single("file"),
  UploadController.uploadSlideDeck,
);

export default uploadRouter;
