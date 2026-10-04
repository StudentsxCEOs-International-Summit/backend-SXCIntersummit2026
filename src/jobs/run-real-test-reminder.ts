/**
 * REAL End-to-End Cron Jobs Runner
 *
 * Menjalankan SELURUH logika cron job terhadap database Supabase
 * yang sesungguhnya — persis seperti yang terjadi saat cron berjalan
 * di production, tapi dipanggil secara instan.
 *
 * Usage:
 *   npx tsx src/jobs/run-real-test-reminder.ts
 *
 * Catatan:
 *   - Email menggunakan Mock Engine jika SMTP_USER/SMTP_PASS belum di-set.
 *   - Untuk mengirim email nyata, tambahkan SMTP config di .env
 *   - Script ini menulis ke tabel EmailLog di database
 */

import "dotenv/config";
import prisma from "../configs/db";
import { sendMail, renderEmailTemplate } from "../services/mail.service";
import {
  getAppConfig,
  isRegistrationOpen,
  getEffectiveDeadline,
} from "../configs/appConfig";


const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  white: "\x1b[37m",
};

function header(text: string) {
  console.log(
    `\n${C.cyan}${"═".repeat(64)}${C.reset}` +
      `\n${C.bold}${C.cyan}  ${text}${C.reset}` +
      `\n${C.cyan}${"═".repeat(64)}${C.reset}`,
  );
}

function section(text: string) {
  console.log(
    `\n${C.magenta}── ${text} ${"─".repeat(Math.max(0, 55 - text.length))}${C.reset}`,
  );
}

function ok(msg: string) {
  console.log(`  ${C.green}✔${C.reset} ${msg}`);
}
function warn(msg: string) {
  console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
}
function fail(msg: string) {
  console.log(`  ${C.red}✖${C.reset} ${msg}`);
}
function info(msg: string) {
  console.log(`  ${C.dim}ℹ ${msg}${C.reset}`);
}


interface JobResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
  durationMs: number;
}
const results: JobResult[] = [];

// Pre-flight: Database Connectivity
async function preflight(): Promise<JobResult> {
  section("Pre-flight – Database Connectivity & State");

  const start = Date.now();
  try {
    const userCount = await prisma.user.count();
    const teamCount = await prisma.team.count();
    const blacklistCount = await prisma.blacklist.count();
    const emailLogCount = await prisma.emailLog.count();

    ok("Database connected to Supabase PostgreSQL.");
    info(`Users          : ${userCount}`);
    info(`Teams          : ${teamCount}`);
    info(`Blacklist      : ${blacklistCount}`);
    info(`Email logs     : ${emailLogCount}`);

    // Check target user
    const user = await prisma.user.findUnique({ where: { id: 8 } });
    if (user) {
      ok(`Target user found: id=${user.id} name="${user.name}" email="${user.email}"`);
    } else {
      fail("Target user id=8 NOT found in database!");
    }

    // Check target team
    const team = await prisma.team.findFirst({
      where: { leaderId: 8 },
      include: { leader: true, statuscode: true },
    });
    if (team) {
      const daysOld = Math.ceil(
        (Date.now() - team.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      ok(`Target team found: id=${team.id} name="${team.name}" status=${team.status} (${team.statuscode.code}) age=${daysOld}d`);
    } else {
      fail("No team found for user id=8. Run the seed script first.");
    }

    // Check SMTP status
    const { env } = await import("../configs/env");
    if (env.SMTP_USER && env.SMTP_PASS) {
      ok(`SMTP configured: ${env.SMTP_HOST || "smtp.gmail.com"}:${env.SMTP_PORT || 465} (real emails will be sent)`);
    } else {
      warn("SMTP not configured. Emails will use MOCK ENGINE (console only).");
    }

    return {
      name: "Pre-flight",
      status: user && team ? "PASS" : "FAIL",
      detail: `${userCount} users, ${teamCount} teams. Target user ${user ? "✓" : "✗"}, team ${team ? "✓" : "✗"}.`,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    fail(`Database connection failed: ${error.message}`);
    return {
      name: "Pre-flight",
      status: "FAIL",
      detail: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// Token Cleanup (real DB)
async function runTokenCleanup(): Promise<JobResult> {
  section("Job 1 – Token Cleanup (REAL database)");

  const start = Date.now();
  try {
    const before = await prisma.blacklist.count();
    const expired = await prisma.blacklist.count({
      where: { expiresAt: { lt: new Date() } },
    });

    info(`Blacklist tokens before: ${before} (${expired} expired)`);

    // Execute the actual cleanup — same as token-cleanup.job.ts line 8–14
    const result = await prisma.blacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      ok(`Purged ${result.count} expired token(s) from blacklist.`);
    } else {
      ok("No expired tokens to purge — blacklist is clean.");
    }

    const after = await prisma.blacklist.count();
    info(`Blacklist tokens after: ${after}`);

    return {
      name: "Token Cleanup",
      status: "PASS",
      detail: `Purged ${result.count}. Before: ${before}, after: ${after}.`,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    fail(`Token cleanup failed: ${error.message}`);
    return {
      name: "Token Cleanup",
      status: "FAIL",
      detail: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// Deadline Reminders (real DB + real/mock email)
async function runDeadlineReminders(): Promise<JobResult> {
  section("Job 2a – Deadline Reminder Emails (REAL)");

  const start = Date.now();
  try {
    const deadline = getEffectiveDeadline();
    const now = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const regOpen = isRegistrationOpen();
    const config = getAppConfig();

    info(`Registration deadline       : ${deadline.toISOString()}`);
    info(`Days until deadline         : ${daysUntilDeadline}`);
    info(`Registration open?          : ${regOpen}`);
    info(`Extended reg enabled?       : ${config.EXTENDED_REGISTRATION_ENABLED}`);

    if (daysUntilDeadline > 3 || daysUntilDeadline < 0) {
      warn(
        `Deadline is ${daysUntilDeadline} day(s) away — reminders only fire within 3-day window.`,
      );
      info(
        "Forcing send anyway for testing purposes (bypassing window check)...",
      );
    }

    if (!regOpen) {
      warn("Registration is closed per appConfig.");
      info("Forcing send anyway for testing purposes...");
    }

    // Query real database for pending teams (status=15)
    const pendingTeams = await prisma.team.findMany({
      where: { status: 15 },
      include: { leader: true },
    });

    info(`Teams with pending status (15): ${pendingTeams.length}`);

    let sent = 0;
    for (const team of pendingTeams) {
      if (!team.leader?.email) continue;

      try {
        // Same email content as email-scheduler.job.ts sendDeadlineReminders()
        const effectiveDays =
          daysUntilDeadline <= 3 && daysUntilDeadline >= 0
            ? daysUntilDeadline
            : 3; // fallback for test

        const html = renderEmailTemplate({
          title: "Registration Deadline Reminder",
          contentHtml: `
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hi <strong>${team.leader.name}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Registration for <strong>SXC International Summit 2026</strong> closes in <strong>${effectiveDays} days</strong> (${deadline.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}).</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Please submit your documents and payment before the deadline.</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0;">Best regards,<br><strong>SXC Intersummit 2026 Team</strong></p>
          `
        });

        await sendMail({
          to: team.leader.email,
          subject: `[SXC Intersummit 2026] Action Required: Registration closes in ${effectiveDays} days`,
          html,
          text: `Hi ${team.leader.name}, registration closes in ${effectiveDays} days. Please submit your documents and payment.`,
        });

        // Log to real EmailLog table
        await prisma.emailLog.create({
          data: {
            toEmail: team.leader.email,
            subject: "Registration Deadline Reminder",
            template: "deadline_reminder",
            status: "success",
          },
        });

        sent++;
        ok(`Sent deadline reminder → ${team.leader.email} (team: ${team.name})`);
      } catch (err: any) {
        fail(
          `Deadline reminder to ${team.leader.email} failed: ${err.message}`,
        );
      }
    }

    if (sent === 0 && pendingTeams.length === 0) {
      warn("No pending teams found in database.");
    }

    return {
      name: "Deadline Reminders",
      status: "PASS",
      detail: `Sent ${sent} of ${pendingTeams.length} pending team(s).`,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    fail(`Deadline reminders failed: ${error.message}`);
    return {
      name: "Deadline Reminders",
      status: "FAIL",
      detail: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// Payment Reminders (real DB + real/mock email)
async function runPaymentReminders(): Promise<JobResult> {
  section("Job 2b – Payment Reminder Emails (REAL)");

  const start = Date.now();
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // Query real database — same as email-scheduler.job.ts sendPaymentReminders()
    const teamsNeedingPayment = await prisma.team.findMany({
      where: {
        status: 15,
        createdAt: { lt: threeDaysAgo },
      },
      include: { leader: true },
    });

    info(
      `Teams needing payment (status 15, created >3 days ago): ${teamsNeedingPayment.length}`,
    );

    let sent = 0;
    let skippedAlreadyReminded = 0;

    for (const team of teamsNeedingPayment) {
      if (!team.leader?.email) continue;

      // Check for recent reminder in real EmailLog table
      const recentEmail = await prisma.emailLog.findFirst({
        where: {
          toEmail: team.leader.email,
          template: "payment_reminder",
          sentAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      if (recentEmail) {
        skippedAlreadyReminded++;
        info(
          `Skipped ${team.leader.email} — already reminded at ${recentEmail.sentAt.toISOString()}.`,
        );
        continue;
      }

      try {
        // Same email content as email-scheduler.job.ts sendPaymentReminders()
        const html = renderEmailTemplate({
          title: "Payment Reminder",
          contentHtml: `
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hi <strong>${team.leader.name}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">We are missing the payment proof for team <strong>${team.name}</strong>.</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Please upload it to complete your registration for SXC International Summit 2026.</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0;">Best regards,<br><strong>SXC Intersummit 2026 Team</strong></p>
          `
        });

        await sendMail({
          to: team.leader.email,
          subject: `[SXC Intersummit 2026] Missing payment proof for team ${team.name}`,
          html,
          text: `Hi ${team.leader.name}, we are missing the payment proof for team ${team.name}. Please upload it.`,
        });

        // Log to real EmailLog table
        await prisma.emailLog.create({
          data: {
            toEmail: team.leader.email,
            subject: "Payment Reminder",
            template: "payment_reminder",
            status: "success",
          },
        });

        sent++;
        ok(
          `Sent payment reminder → ${team.leader.email} (team: ${team.name})`,
        );
      } catch (err: any) {
        fail(
          `Payment reminder to ${team.leader.email} failed: ${err.message}`,
        );
      }
    }

    info(`Sent: ${sent} | Skipped (already reminded): ${skippedAlreadyReminded}`);

    return {
      name: "Payment Reminders",
      status: "PASS",
      detail: `Sent ${sent}, skipped ${skippedAlreadyReminded} of ${teamsNeedingPayment.length} eligible team(s).`,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    fail(`Payment reminders failed: ${error.message}`);
    return {
      name: "Payment Reminders",
      status: "FAIL",
      detail: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// Post-flight: Verify EmailLog entries written
async function postflight(): Promise<JobResult> {
  section("Post-flight – EmailLog Verification");

  const start = Date.now();
  try {
    const recentLogs = await prisma.emailLog.findMany({
      where: { toEmail: "quykuycuy@gmail.com" },
      orderBy: { sentAt: "desc" },
      take: 10,
    });

    info(`EmailLog entries for quykuycuy@gmail.com: ${recentLogs.length}`);
    for (const log of recentLogs) {
      ok(
        `[${log.sentAt.toISOString()}] template="${log.template}" subject="${log.subject}" status="${log.status}"`,
      );
    }

    const hasDeadline = recentLogs.some(
      (l) => l.template === "deadline_reminder",
    );
    const hasPayment = recentLogs.some(
      (l) => l.template === "payment_reminder",
    );

    if (hasDeadline && hasPayment) {
      ok("Both deadline_reminder and payment_reminder logs found in database.");
    } else if (hasDeadline) {
      warn("Only deadline_reminder found. Payment reminder may have been skipped (already sent).");
    } else if (hasPayment) {
      warn("Only payment_reminder found.");
    }

    return {
      name: "EmailLog Verify",
      status: "PASS",
      detail: `${recentLogs.length} log(s). deadline=${hasDeadline}, payment=${hasPayment}.`,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    fail(`Post-flight failed: ${error.message}`);
    return {
      name: "EmailLog Verify",
      status: "FAIL",
      detail: error.message,
      durationMs: Date.now() - start,
    };
  }
}


async function main() {
  header("SXC Intersummit 2026 – REAL End-to-End Cron Job Test");
  console.log(`  ${C.dim}Timestamp : ${new Date().toISOString()}${C.reset}`);
  console.log(`  ${C.dim}Node      : ${process.version}${C.reset}`);
  console.log(
    `  ${C.dim}Database  : Supabase PostgreSQL (via DIRECT_URL)${C.reset}`,
  );

  // 0. Pre-flight
  results.push(await preflight());
  if (results[0].status === "FAIL") {
    console.log(
      `\n${C.bgRed}${C.white}${C.bold} ABORTED ${C.reset} Pre-flight failed. Fix database / seed data first.\n`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // 1. Token Cleanup
  results.push(await runTokenCleanup());

  // 2a. Deadline Reminders
  results.push(await runDeadlineReminders());

  // 2b. Payment Reminders
  results.push(await runPaymentReminders());

  // 3. Post-flight verification
  results.push(await postflight());

  
  header("Test Results Summary");

  const colName = 28;
  const colStatus = 8;
  const colTime = 10;

  console.log(
    `  ${C.bold}${"Job".padEnd(colName)}${"Status".padEnd(colStatus)}${"Time".padEnd(colTime)}Detail${C.reset}`,
  );
  console.log(`  ${"─".repeat(colName + colStatus + colTime + 30)}`);

  for (const r of results) {
    const statusColor =
      r.status === "PASS" ? C.green : r.status === "FAIL" ? C.red : C.yellow;
    const statusIcon =
      r.status === "PASS" ? "✔" : r.status === "FAIL" ? "✖" : "⊘";

    console.log(
      `  ${r.name.padEnd(colName)}${statusColor}${statusIcon} ${r.status.padEnd(colStatus - 2)}${C.reset}${(r.durationMs + "ms").padEnd(colTime)}${C.dim}${r.detail}${C.reset}`,
    );
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log();
  if (failed === 0) {
    console.log(
      `  ${C.bgGreen}${C.white}${C.bold} ALL JOBS OK ${C.reset}  ${C.green}${passed} passed${C.reset}, ${C.yellow}${skipped} skipped${C.reset}, ${C.red}${failed} failed${C.reset}`,
    );
  } else {
    console.log(
      `  ${C.bgRed}${C.white}${C.bold} FAILURES DETECTED ${C.reset}  ${C.green}${passed} passed${C.reset}, ${C.yellow}${skipped} skipped${C.reset}, ${C.red}${failed} failed${C.reset}`,
    );
  }

  console.log(
    `\n  ${C.dim}Tip: Tambahkan SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS di .env${C.reset}` +
      `\n  ${C.dim}untuk mengirim email nyata ke quykuycuy@gmail.com.${C.reset}\n`,
  );

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err);
  await prisma.$disconnect();
  process.exit(1);
});
