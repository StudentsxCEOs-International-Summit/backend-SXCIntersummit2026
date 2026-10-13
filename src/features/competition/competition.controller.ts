import { Request, Response } from 'express';
import prisma from '../../configs/db';
import { ok, badRequest, notFound, internalError } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { sendMail, renderEmailTemplate } from '../../services/mail.service';

// GET /competition/teams (Dashboard)
export async function getDashboardTeams(req: AuthRequest, res: Response) {
  try {
    const teams = await prisma.team.findMany({
      include: {
        leader: { select: { name: true, email: true, institution: true } },
        TeamMember: {
          include: {
            user: { select: { name: true, email: true, institution: true } }
          }
        },
        statuscode: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    return ok(res, teams, 'Teams retrieved successfully.');
  } catch (error: any) {
    console.error('[COMPETITION] getDashboardTeams error:', error.message);
    return internalError(res, 'Failed to retrieve teams.');
  }
}

// PUT /competition/preliminary/:teamId (ADMIN-01 & IBCC-05)
export async function updatePreliminaryStatus(req: AuthRequest, res: Response) {
  try {
    const teamId = Number(req.params.teamId);
    const { status, feedback, score } = req.body as {
      status: 'passed' | 'failed';
      feedback?: string;
      score?: number;
    };

    if (!teamId || !status) return badRequest(res, 'teamId and status (passed/failed) are required.');

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { leader: true }
    });

    if (!team) return notFound(res, 'Team not found.');

    const newStatusCode = status === 'passed' ? 'PASSED_PRELIMINARY' : 'FAILED_PRELIMINARY';
    
    let statusRecord = await prisma.status.findUnique({ where: { code: newStatusCode } });
    if (!statusRecord) {
      statusRecord = await prisma.status.create({
        data: {
          code: newStatusCode,
          description: status === 'passed' ? 'Passed Preliminary Round' : 'Failed Preliminary Round',
        }
      });
    }

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: {
        status: statusRecord.id,
        score: score ?? team.score
      },
      include: { statuscode: true }
    });

    if (req.user?.id) {
      await prisma.activityLog.create({
        data: {
          staffId: req.user.id,
          activity: `Evaluated team ${team.name} as ${status} with score ${score ?? team.score ?? 'N/A'}`,
          status: status,
        }
      });
    }

    // IBCC-05 Email Automation
    if (team.leader?.email) {
      const subject = status === 'passed' 
        ? '[SXC Intersummit 2026] Congratulations! You passed the Preliminary Round!' 
        : '[SXC Intersummit 2026] Preliminary Round Results';
        
      const contentHtml = status === 'passed'
        ? `
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Congratulations, ${team.leader?.name || ''}!</h2>
          <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
            We are pleased to inform you that your team <strong>${team.name}</strong> has successfully passed the <strong>Preliminary Round</strong> of SXC International Summit 2026!
          </p>
          ${score !== undefined ? `<p style="margin: 0 0 16px 0; color: #1e293b; font-size: 15px;"><strong>Preliminary Score:</strong> ${score}</p>` : ''}
          <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Next Step: Semifinal Confirmation & Payment</p>
            <p style="margin: 4px 0 0 0; color: #15803d; font-size: 13px;">Please log in to your participant dashboard to complete the semifinal commitment fee and requirement verification.</p>
          </div>
        `
        : `
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, ${team.leader?.name || ''}</h2>
          <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
            Thank you for participating in SXC International Summit 2026. After thorough evaluation, we regret to inform you that your team <strong>${team.name}</strong> did not advance to the Semifinal Round.
          </p>
          ${score !== undefined ? `<p style="margin: 0 0 16px 0; color: #1e293b; font-size: 15px;"><strong>Preliminary Score:</strong> ${score}</p>` : ''}
          <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #334155; font-size: 14px; font-weight: 600;">Evaluator Feedback:</p>
            <p style="margin: 4px 0 0 0; color: #475569; font-size: 13px;">${feedback || 'Keep developing your ideas and see you in the next summit event!'}</p>
          </div>
        `;

      const html = renderEmailTemplate({
        title: status === 'passed' ? 'Preliminary Results - Passed' : 'Preliminary Results',
        headerHeading: status === 'passed' ? 'Congratulations!' : 'Preliminary Round Results',
        contentHtml,
      });

      const mailResult = await sendMail({
        to: team.leader.email,
        subject,
        html,
        text: status === 'passed'
          ? `Congratulations! Your team ${team.name} has passed the Preliminary Round.`
          : `Thank you for participating. Your team ${team.name} did not advance past the Preliminary Round.`
      });

      await prisma.emailLog.create({
        data: {
          toEmail: team.leader.email,
          subject,
          template: status === 'passed' ? 'preliminary_passed' : 'preliminary_failed',
          status: mailResult.success ? 'success' : 'failed'
        }
      });
    }

    return ok(res, updatedTeam, 'Preliminary status updated successfully.');
  } catch (error: any) {
    console.error('[COMPETITION] updatePreliminaryStatus error:', error.message);
    return internalError(res, 'Failed to update preliminary status.');
  }
}

