import prisma from "../../configs/db";
import { sendMail } from "../../services/mail.service";
import { renderStatusChangeEmail } from "./status.templates";

/**
 * Notifies a team's leader via email when the team status changes.
 * Also logs the email in the EmailLog table.
 *
 * @param teamId  The team whose status changed
 * @param newStatus  The new status code string (e.g. "PAID", "REJECTED_PAYMENT")
 * @param context  A short description of what triggered the change
 */
export async function notifyStatusChange(
  teamId: number,
  newStatus: string,
  context: string,
): Promise<void> {
  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        leader: true,
        statuscode: true,
      },
    });

    if (!team || !team.leader?.email) {
      console.warn(`[STATUS] Cannot notify team ${teamId}: team or leader not found.`);
      return;
    }

    const subject = `[SXC Intersummit 2026] Status Update – ${team.name}`;
    const html = renderStatusChangeEmail({
      teamName: team.name,
      leaderName: team.leader.name,
      newStatus,
      statusDescription: team.statuscode?.description || newStatus,
      context,
    });

    const result = await sendMail({
      to: team.leader.email,
      subject,
      html,
      text: `Hi ${team.leader.name}, your team "${team.name}" status has been updated to: ${newStatus}.`,
    });

    // Log email
    await prisma.emailLog.create({
      data: {
        toEmail: team.leader.email,
        subject,
        template: `status_change_${context}`,
        status: result.success ? "success" : "failed",
      },
    });

    console.log(
      `[STATUS] Email sent to ${team.leader.email} for status change: ${newStatus}`,
    );
  } catch (error: any) {
    console.error("[STATUS] notifyStatusChange error:", error.message);
    // Non-blocking – don't throw
  }
}

/**
 * Send semifinal result emails (Top 5 vs eliminated).
 */
export async function sendSemifinalResultEmails(
  qualifiedTeamIds: number[],
  eliminatedTeamIds: number[],
): Promise<void> {
  const allIds = [...qualifiedTeamIds, ...eliminatedTeamIds];

  const teams = await prisma.team.findMany({
    where: { id: { in: allIds } },
    include: { leader: true },
  });

  for (const team of teams) {
    if (!team.leader?.email) continue;

    const isQualified = qualifiedTeamIds.includes(team.id);
    const subject = isQualified
      ? `[SXC Intersummit 2026] 🎉 Congratulations! ${team.name} advances to the Final!`
      : `[SXC Intersummit 2026] Semifinal Results – ${team.name}`;

    const html = renderStatusChangeEmail({
      teamName: team.name,
      leaderName: team.leader.name,
      newStatus: isQualified ? "QUALIFIED_FINAL" : "ELIMINATED_SEMIFINAL",
      statusDescription: isQualified
        ? "Your team has been selected as one of the Top 5 teams advancing to the Final round!"
        : "Thank you for your participation in the Semifinal. Unfortunately, your team did not advance to the Final round this time.",
      context: "semifinal_result",
    });

    try {
      const result = await sendMail({ to: team.leader.email, subject, html });

      await prisma.emailLog.create({
        data: {
          toEmail: team.leader.email,
          subject,
          template: isQualified ? "semifinal_qualified" : "semifinal_eliminated",
          status: result.success ? "success" : "failed",
        },
      });
    } catch (err: any) {
      console.error(`[STATUS] Failed to send semifinal email to ${team.leader.email}:`, err.message);
    }
  }
}
