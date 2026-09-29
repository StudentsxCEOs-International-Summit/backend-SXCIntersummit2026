import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware";
import { ok, internalError } from "../../utils/response";
import { getAppConfig, reloadAppConfig, isRegistrationOpen, getEffectiveDeadline } from "../../configs/appConfig";
import { triggerEmailScheduler } from "../../jobs/email-scheduler.job";

const configRouter = Router();

// GET /config — public, returns registration deadline info
configRouter.get("/", (_req: Request, res: Response) => {
  try {
    const config = getAppConfig();
    const deadline = getEffectiveDeadline();

    return ok(res, {
      registrationOpen: isRegistrationOpen(),
      deadline: deadline.toISOString(),
      extendedRegistration: config.EXTENDED_REGISTRATION_ENABLED,
      maxSlidePages: config.MAX_SLIDE_PAGES,
      maxSlideSizeMB: config.MAX_SLIDE_SIZE_MB,
    }, "Application configuration retrieved.");
  } catch (error: any) {
    return internalError(res, "Failed to load configuration.");
  }
});

// POST /config/reload — admin, reloads config from env
configRouter.post("/reload", requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    const config = reloadAppConfig();
    return ok(res, config, "Configuration reloaded from environment.");
  } catch (error: any) {
    return internalError(res, "Failed to reload configuration.");
  }
});

// POST /config/trigger-emails — admin or cronjob.org webhook
// For cronjob.org, configure it to POST to: {APP_URL}/api/config/trigger-emails
configRouter.post("/trigger-emails", async (_req: Request, res: Response) => {
  try {
    const result = await triggerEmailScheduler();
    return ok(res, result, "Email scheduler triggered manually.");
  } catch (error: any) {
    return internalError(res, "Failed to trigger email scheduler.");
  }
});

export default configRouter;
