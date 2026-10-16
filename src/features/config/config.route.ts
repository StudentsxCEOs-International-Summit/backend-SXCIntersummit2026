import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware";
import { ok, badRequest, internalError } from "../../utils/response";
import {
  getAppConfig,
  reloadAppConfig,
  updateAppConfig,
  isRegistrationOpen,
  getEffectiveDeadline,
  AppConfigType,
} from "../../configs/appConfig";
import { triggerEmailScheduler } from "../../jobs/email-scheduler.job";
import { env } from "../../configs/env";

const configRouter = Router();

/**
 * Middleware: Allows access if `x-cron-secret` matches `env.CRON_SECRET`,
 * OR if the user provides a valid Admin/Staff auth token.
 */
function authorizeConfigUpdate(req: Request, res: Response, next: () => void) {
  const secret = req.headers["x-cron-secret"] as string | undefined;
  if (secret && env.CRON_SECRET && secret === env.CRON_SECRET) {
    return next();
  }

  // Fallback to checking admin token
  return requireAuth(req, res, () => {
    return requireAdmin(req, res, next);
  });
}

// GET /config — public, returns registration deadline info
configRouter.get("/", (_req: Request, res: Response) => {
  try {
    const config = getAppConfig();
    const deadline = getEffectiveDeadline();

    return ok(
      res,
      {
        registrationOpen: isRegistrationOpen(),
        deadline: deadline.toISOString(),
        extendedRegistration: config.EXTENDED_REGISTRATION_ENABLED,
        maxSlidePages: config.MAX_SLIDE_PAGES,
        maxSlideSizeMB: config.MAX_SLIDE_SIZE_MB,
        deadlineReminderDays: config.DEADLINE_REMINDER_DAYS,
        paymentReminderDays: config.PAYMENT_REMINDER_DAYS,
      },
      "Application configuration retrieved.",
    );
  } catch (error: any) {
    return internalError(res, "Failed to load configuration.");
  }
});

/**
 * PATCH /config — updates application configuration dynamically without redeploying.
 * Supports updating registration deadline, extended registration flags, slide limits, etc.
 */
configRouter.patch("/", authorizeConfigUpdate, (req: Request, res: Response) => {
  try {
    const {
      registrationDeadline,
      REGISTRATION_DEADLINE,
      registrationExtendedDeadline,
      REGISTRATION_EXTENDED_DEADLINE,
      extendedRegistrationEnabled,
      EXTENDED_REGISTRATION_ENABLED,
      maxSlidePages,
      MAX_SLIDE_PAGES,
      maxSlideSizeMB,
      MAX_SLIDE_SIZE_MB,
      deadlineReminderDays,
      DEADLINE_REMINDER_DAYS,
      paymentReminderDays,
      PAYMENT_REMINDER_DAYS,
    } = req.body;

    const updates: Partial<AppConfigType> = {};

    const deadline = registrationDeadline || REGISTRATION_DEADLINE;
    if (deadline !== undefined) {
      const parsed = new Date(deadline);
      if (isNaN(parsed.getTime())) {
        return badRequest(
          res,
          "Invalid date format for registrationDeadline. Please use ISO format (e.g. '2026-10-18T23:59:59+07:00')",
        );
      }
      updates.REGISTRATION_DEADLINE = deadline;
    }

    const extDeadline =
      registrationExtendedDeadline || REGISTRATION_EXTENDED_DEADLINE;
    if (extDeadline !== undefined) {
      const parsed = new Date(extDeadline);
      if (isNaN(parsed.getTime())) {
        return badRequest(
          res,
          "Invalid date format for registrationExtendedDeadline. Please use ISO format (e.g. '2026-11-30T23:59:59+07:00')",
        );
      }
      updates.REGISTRATION_EXTENDED_DEADLINE = extDeadline;
    }

    const extEnabled =
      extendedRegistrationEnabled !== undefined
        ? extendedRegistrationEnabled
        : EXTENDED_REGISTRATION_ENABLED;
    if (extEnabled !== undefined) {
      updates.EXTENDED_REGISTRATION_ENABLED = Boolean(extEnabled);
    }

    const slidePages =
      maxSlidePages !== undefined ? maxSlidePages : MAX_SLIDE_PAGES;
    if (slidePages !== undefined) {
      updates.MAX_SLIDE_PAGES = Number(slidePages);
    }

    const slideSize =
      maxSlideSizeMB !== undefined ? maxSlideSizeMB : MAX_SLIDE_SIZE_MB;
    if (slideSize !== undefined) {
      updates.MAX_SLIDE_SIZE_MB = Number(slideSize);
    }

    const dlReminder =
      deadlineReminderDays !== undefined
        ? deadlineReminderDays
        : DEADLINE_REMINDER_DAYS;
    if (dlReminder !== undefined) {
      updates.DEADLINE_REMINDER_DAYS = Number(dlReminder);
    }

    const payReminder =
      paymentReminderDays !== undefined
        ? paymentReminderDays
        : PAYMENT_REMINDER_DAYS;
    if (payReminder !== undefined) {
      updates.PAYMENT_REMINDER_DAYS = Number(payReminder);
    }

    if (Object.keys(updates).length === 0) {
      return badRequest(
        res,
        "No valid configuration fields provided to update.",
      );
    }

    const updated = updateAppConfig(updates);
    const effectiveDeadline = getEffectiveDeadline();

    return ok(
      res,
      {
        registrationOpen: isRegistrationOpen(),
        deadline: effectiveDeadline.toISOString(),
        extendedRegistration: updated.EXTENDED_REGISTRATION_ENABLED,
        maxSlidePages: updated.MAX_SLIDE_PAGES,
        maxSlideSizeMB: updated.MAX_SLIDE_SIZE_MB,
        deadlineReminderDays: updated.DEADLINE_REMINDER_DAYS,
        paymentReminderDays: updated.PAYMENT_REMINDER_DAYS,
        config: updated,
      },
      "Application configuration updated successfully.",
    );
  } catch (error: any) {
    return internalError(res, "Failed to update configuration: " + error.message);
  }
});

// POST /config/reload — admin, reloads config from env
configRouter.post(
  "/reload",
  requireAuth,
  requireAdmin,
  (_req: Request, res: Response) => {
    try {
      const config = reloadAppConfig();
      return ok(res, config, "Configuration reloaded from environment.");
    } catch (error: any) {
      return internalError(res, "Failed to reload configuration.");
    }
  },
);

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

