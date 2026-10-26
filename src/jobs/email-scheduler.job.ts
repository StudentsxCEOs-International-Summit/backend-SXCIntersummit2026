import cron from "node-cron";
import prisma from "../configs/db";
import { sendMail, renderEmailTemplate } from "../services/mail.service";
import { getAppConfig, isRegistrationOpen, getEffectiveDeadline } from "../configs/appConfig";

/**
 * Email Scheduler Job
 *
 * Designed to work with cronjob.org or as a built-in node-cron job.
 *
 * This cron runs daily at 09:00 WIB (02:00 UTC) and:
 * 1. Sends registration deadline reminder emails (3 days before deadline).
 * 2. Sends payment reminder to teams with pending payment status.
 */
export function startEmailSchedulerJob() {
  // Runs daily at 09:00 WIB (UTC+7) → 02:00 UTC
  cron.schedule("0 2 * * *", async () => {
    console.log("[EMAIL SCHEDULER] Running scheduled email tasks...");

    try {
      await sendDeadlineReminders();
      await sendPaymentReminders();
    } catch (error: any) {
      console.error("[EMAIL SCHEDULER] Job error:", error.message);
    }
  });

  console.log("[EMAIL SCHEDULER] Email scheduler job started (daily at 09:00 WIB).");
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

  let sent = 0;
  for (const team of pendingTeams) {
    if (!team.leader?.email) continue;

    try {
      const html = renderEmailTemplate({
        title: "Registration Deadline Reminder",
        contentHtml: `
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hi <strong>${team.leader.name}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">This is a reminder that the registration deadline for <strong>SXC International Summit 2026</strong> is in <strong>${daysUntilDeadline} day(s)</strong> (${deadline.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}).</p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Please ensure all required registration documents are submitted before the deadline.</p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0;">Best regards,<br><strong>StudentsxCEOs International Summit 2026 Team</strong></p>
        `
      });

      await sendMail({
        to: team.leader.email,
        subject: `[SXC Intersummit 2026] ⏰ Registration Deadline Reminder – ${daysUntilDeadline} day(s) left!`,
        html,
        text: `Hi ${team.leader.name}, registration deadline is in ${daysUntilDeadline} day(s). Please complete your submission.`,
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
      console.error(`[EMAIL SCHEDULER] Deadline reminder to ${team.leader.email} failed:`, err.message);
    }
  }

  if (sent > 0) {
    console.log(`[EMAIL SCHEDULER] Sent ${sent} deadline reminder email(s).`);
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
      const html = renderEmailTemplate({
        title: "Semifinal Payment Reminder",
        contentHtml: `
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hi <strong>${team.leader.name}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Congratulations again on passing the preliminary round! Your team <strong>${team.name}</strong> has not yet submitted the semifinal payment proof for <strong>SXC International Summit 2026</strong>.</p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">The semifinal fee is <strong>${SEMIFINAL_FEE_TEXT}</strong>. Please transfer it and upload your payment proof from the My Team page as soon as possible.</p>
          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0;">Best regards,<br><strong>StudentsxCEOs International Summit 2026 Team</strong></p>
        `
      });

      await sendMail({
        to: team.leader.email,
        subject: `[SXC Intersummit 2026] 💳 Semifinal Payment Reminder – ${team.name}`,
        html,
        text: `Hi ${team.leader.name}, please pay the semifinal fee (${SEMIFINAL_FEE_TEXT}) and upload the payment proof for team ${team.name}.`,
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
      console.error(`[EMAIL SCHEDULER] Payment reminder to ${team.leader.email} failed:`, err.message);
    }
  }

  if (sent > 0) {
    console.log(`[EMAIL SCHEDULER] Sent ${sent} payment reminder email(s).`);
  }
  return sent;
}

/**
 * One-off endpoint handler to trigger the email scheduler manually.
 * Useful for integration with cronjob.org webhooks.
 */
export async function triggerEmailScheduler(): Promise<{ deadlineReminders: number; paymentReminders: number }> {
  const deadlineReminders = await sendDeadlineReminders();
  const paymentReminders = await sendPaymentReminders();
  return { deadlineReminders, paymentReminders };
}

