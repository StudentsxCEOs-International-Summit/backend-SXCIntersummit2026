import prisma from "../../configs/db";
import { createChildLogger } from "../../configs/logger";
import { sendMail } from "../../services/mail.service";
import { renderStatusChangeEmail } from "./ibcc.templates";

const ibccLogger = createChildLogger("IBCC");

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
      ibccLogger.warn({ teamId }, "Cannot notify team: team or leader not found");
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

    await prisma.emailLog.create({
      data: {
        toEmail: team.leader.email,
        subject,
        template: `status_change_${context}`,
        status: result.success ? "success" : "failed",
      },
    });
  } catch (error: any) {
    ibccLogger.error({ err: error }, "notifyStatusChange error");
  }
}

export async function sendSemifinalResultEmails(
  qualifiedTeamIds: number[],
  eliminatedTeamIds: number[],
): Promise<void> {
  const allIds = [...qualifiedTeamIds, ...eliminatedTeamIds];

  const teams = await prisma.team.findMany({
    where: { id: { in: allIds } },
    include: { leader: true },
  });

  const emailLogs: any[] = [];

  for (const team of teams) {
    if (!team.leader?.email) continue;

    const isQualified = qualifiedTeamIds.includes(team.id);
    const subject = isQualified
      ? `[SXC Intersummit 2026] Congratulations! ${team.name} advances to the Final!`
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

      emailLogs.push({
        toEmail: team.leader.email,
        subject,
        template: isQualified ? "semifinal_qualified" : "semifinal_eliminated",
        status: result.success ? "success" : "failed",
      });
    } catch (err: any) {
      ibccLogger.error({ err, leaderEmail: team.leader.email }, "Failed to send semifinal email");
    }
  }

  if (emailLogs.length > 0) {
    await prisma.emailLog.createMany({
      data: emailLogs,
    });
  }
}
