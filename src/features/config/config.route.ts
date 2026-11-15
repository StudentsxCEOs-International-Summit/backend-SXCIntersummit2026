import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../../middlewares/auth.middleware";
import { ok, badRequest, internalError } from "../../utils/response";
import {
  getAppConfig,
  reloadAppConfigFromEnv,
  updateAppConfigInDb,
  isRegistrationOpen,
  getEffectiveDeadline,
  AppConfigType,
} from "../../configs/appConfig";
import { triggerEmailScheduler } from "../../jobs/email-scheduler.job";
import { env } from "../../configs/env";

const configRouter = Router();

function authorizeConfigUpdate(req: Request, res: Response, next: () => void) {
  const secret = req.headers["x-cron-secret"] as string | undefined;
  if (secret && env.CRON_SECRET && secret === env.CRON_SECRET) {
    return next();
  }

  return requireAuth(req, res, () => {
    return requireAdmin(req, res, next);
  });
}

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
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      },
      "Application configuration retrieved.",
    );
  } catch (error: any) {
    return internalError(res, "Failed to load configuration.");
  }
});

configRouter.patch("/", authorizeConfigUpdate, async (req: Request, res: Response) => {
  try {
    const staffId = (req as any).user?.id ? Number((req as any).user.id) : undefined;
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
          "Invalid date format for registrationDeadline. Please use ISO format (e.g. '2026-12-19T23:59:59+07:00')",
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
          "Invalid date format for registrationExtendedDeadline. Please use ISO format (e.g. '2026-12-30T23:59:59+07:00')",
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

    const updated = await updateAppConfigInDb(updates, staffId);
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
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
        config: updated,
      },
      "Application configuration updated successfully in database.",
    );
  } catch (error: any) {
    return internalError(res, "Failed to update configuration: " + error.message);
  }
});

configRouter.post(
  "/reload",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const config = await reloadAppConfigFromEnv();
      return ok(res, config, "Configuration reloaded from environment defaults into database.");
    } catch (error: any) {
      return internalError(res, "Failed to reload configuration.");
    }
  },
);

configRouter.post("/trigger-emails", authorizeConfigUpdate, async (_req: Request, res: Response) => {
  try {
    const result = triggerEmailScheduler();
    return ok(
      res,
      result,
      result.started
        ? "Email scheduler started in the background; reminder mails go out about a minute apart."
        : "Email scheduler is already running.",
      202,
    );
  } catch (error: any) {
    return internalError(res, "Failed to trigger email scheduler.");
  }
});

export default configRouter;
