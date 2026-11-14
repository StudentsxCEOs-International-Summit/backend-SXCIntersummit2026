import cron from "node-cron";
import prisma from "../configs/db";
import { sendMail, renderPlainEmail } from "../services/mail.service";
import { getAppConfig, isRegistrationOpen, getEffectiveDeadline } from "../configs/appConfig";
import { createChildLogger } from "../configs/logger";

const schedulerLogger = createChildLogger("SCHEDULER");

/**
 * Email Scheduler Job
 *
 * Designed to work with cronjob.org or as a built-in node-cron job.
 *
 * This cron runs daily at 09:00 WIB and:
 * 1. Sends registration deadline reminder emails (3 days before deadline).
 * 2. Sends payment reminder to teams with pending payment status.
 *
 * Reminder mails are batch mails (`bulk: true`): they go out about a minute apart instead of in one
 * burst, because a burst of near-identical mails from one Gmail account gets them blocked as spam.
 * A run therefore takes a while. A second trigger while one is running (the built-in cron and
 * cronjob.org both firing) is skipped, and a leader already reminded recently is not mailed again.
 */
const SCHEDULE_TIMEZONE = "Asia/Jakarta";

/** A leader who got a deadline reminder this recently is not reminded again (guards double triggers). */
const DEADLINE_REMINDER_REPEAT_MS = 20 * 60 * 60 * 1000;

const SIGNATURE_TEXT = ["", "Best regards,", "StudentsxCEOs International Summit 2026 Team"];

export function startEmailSchedulerJob() {
  // node-cron uses the server's own timezone unless told otherwise; pin it so 09:00 means 09:00 WIB.
  cron.schedule(
    "0 9 * * *",
    async () => {
      await runEmailScheduler("cron").done;
    },
    { timezone: SCHEDULE_TIMEZONE, noOverlap: true },
  );

  schedulerLogger.info("Email scheduler job started (daily at 09:00 WIB)");
}

export interface EmailSchedulerResult {
  deadlineReminders: number;
  paymentReminders: number;
}

let currentRun: Promise<EmailSchedulerResult> | null = null;

/** Starts a run unless one is already going; `done` resolves when that run has finished. */
export function runEmailScheduler(source: "cron" | "http"): {
  started: boolean;
  done: Promise<EmailSchedulerResult>;
} {
  if (currentRun) {
    schedulerLogger.warn({ source }, "Email scheduler is already running; this trigger is skipped");
    return { started: false, done: currentRun };
  }

  schedulerLogger.info({ source }, "Running scheduled email tasks");
  currentRun = (async () => {
    const result: EmailSchedulerResult = { deadlineReminders: 0, paymentReminders: 0 };
    try {
      result.deadlineReminders = await sendDeadlineReminders();
      result.paymentReminders = await sendPaymentReminders();
    } catch (error: any) {
      schedulerLogger.error({ err: error }, "Scheduled email job error");
    }
    schedulerLogger.info({ source, ...result }, "Scheduled email tasks finished");
    return result;
  })().finally(() => {
    currentRun = null;
  });

  return { started: true, done: currentRun };
}

/**
 * Send deadline reminder emails 3 days before the registration deadline.
 */
async function sendDeadlineReminders(): Promise<number> {
  const cfg = getAppConfig();
  const deadline = getEffectiveDeadline();
  const now = new Date();
  const daysUntilDeadline = Math.ceil(
    (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  const reminderDays = cfg.DEADLINE_REMINDER_DAYS || 3;
  if (daysUntilDeadline > reminderDays || daysUntilDeadline < 0) {
    return 0; // Only send when within reminder window
  }

  if (!isRegistrationOpen()) {
    return 0; // Registration already closed
  }

  // Find teams with pending registration status (status code starts with "REG" or default 15)
  const pendingTeams = await prisma.team.findMany({
    where: { status: 15 }, // default status
    include: { leader: true },
  });

  const deadlineText = deadline.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: SCHEDULE_TIMEZONE,
  });
  const dayWord = daysUntilDeadline === 1 ? "day" : "days";

  let sent = 0;
  for (const team of pendingTeams) {
    if (!team.leader?.email) continue;

    // Already reminded (a second trigger, or a restart in the middle of a run): skip.
    const recentReminder = await prisma.emailLog.findFirst({
      where: {
        toEmail: team.leader.email,
        template: "deadline_reminder",
        sentAt: { gt: new Date(Date.now() - DEADLINE_REMINDER_REPEAT_MS) },
      },
    });
    if (recentReminder) continue;

    try {
      const intro = `This is a reminder that registration for StudentsxCEOs International Summit 2026 closes in ${daysUntilDeadline} ${dayWord}, on ${deadlineText}.`;
      const ask = "If your team still has documents to submit, please complete them on the website before then.";
      const html = renderPlainEmail({
        title: "Registration deadline reminder",
        blocksHtml: [`Hi ${team.leader.name},`, intro, ask],
      });

      await sendMail({
        to: team.leader.email,
        subject: `[SXC Intersummit 2026] Registration closes in ${daysUntilDeadline} ${dayWord}`,
        html,
        text: [`Hi ${team.leader.name},`, "", intro, "", ask, ...SIGNATURE_TEXT].join("\n"),
        bulk: true,
      });

      await prisma.emailLog.create({
        data: {
          toEmail: team.leader.email,
          subject: "Registration Deadline Reminder",
          template: "deadline_reminder",
          status: "success",
        },
      });

      sent++;
    } catch (err: any) {
      schedulerLogger.error({ err, leaderEmail: team.leader.email }, "Deadline reminder email failed");
    }
  }

  if (sent > 0) {
    schedulerLogger.info({ sentCount: sent }, "Dispatched deadline reminder emails");
  }
  return sent;
}

/** Semifinal fee shown in the reminder (keep in sync with the frontend's SEMIFINAL_FEE_IDR). */
const SEMIFINAL_FEE_TEXT = "Rp 180.000";

/**
 * Send payment reminders to teams that passed the preliminary but have not uploaded payment proof.
 * The preliminary round is free; payment only starts at the semifinal, so registered teams that
 * are still in the preliminary must never get this email.
 */
async function sendPaymentReminders(): Promise<number> {
  const cfg = getAppConfig();
  const paymentDays = cfg.PAYMENT_REMINDER_DAYS || 3;
  const remindEveryMs = paymentDays * 24 * 60 * 60 * 1000;

  const teamsNeedingPayment = await prisma.team.findMany({
    where: {
      statuscode: { code: "PASSED_PRELIMINARY" },
      submissionTeam: { none: { type: "PAYMENT" } },
    },
    include: { leader: true },
  });

  let sent = 0;
  for (const team of teamsNeedingPayment) {
    if (!team.leader?.email) continue;

    // Remind at most once per reminder period, so one team is not mailed every day.
    const recentEmail = await prisma.emailLog.findFirst({
      where: {
        toEmail: team.leader.email,
        template: "payment_reminder",
        sentAt: { gt: new Date(Date.now() - remindEveryMs) },
      },
    });

    if (recentEmail) continue;

    try {
      const intro = `Congratulations again on passing the preliminary round. We haven't received the semifinal payment proof for your team, ${team.name}, yet.`;
      const ask = `The semifinal fee is ${SEMIFINAL_FEE_TEXT}. Once you've transferred it, please upload the payment proof from the My Team page on the website.`;
      const html = renderPlainEmail({
        title: "Semifinal payment reminder",
        blocksHtml: [`Hi ${team.leader.name},`, intro, ask],
      });

      await sendMail({
        to: team.leader.email,
        subject: `[SXC Intersummit 2026] Semifinal payment for team ${team.name}`,
        html,
        text: [`Hi ${team.leader.name},`, "", intro, "", ask, ...SIGNATURE_TEXT].join("\n"),
        bulk: true,
      });

      await prisma.emailLog.create({
        data: {
          toEmail: team.leader.email,
          subject: "Payment Reminder",
          template: "payment_reminder",
          status: "success",
        },
      });

      sent++;
    } catch (err: any) {
      schedulerLogger.error({ err, leaderEmail: team.leader.email }, "Payment reminder email failed");
    }
  }

  if (sent > 0) {
    schedulerLogger.info({ sentCount: sent }, "Dispatched payment reminder emails");
  }
  return sent;
}

/**
 * For the HTTP triggers (cronjob.org, admin button): starts a run in the background and answers right
 * away. With paced sending a run can take many minutes, longer than an HTTP caller waits; the counts
 * show up in the "Scheduled email tasks finished" log line.
 */
export function triggerEmailScheduler(): { started: boolean; alreadyRunning: boolean } {
  const { started } = runEmailScheduler("http");
  return { started, alreadyRunning: !started };
}
