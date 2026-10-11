import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../../configs/db';
import { ok, badRequest, internalError, notFound } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { sendMail, renderEmailTemplate } from '../../services/mail.service';

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// POST /finance/verify (ADMIN-02 & IBCC-07)
export async function verifyPayment(req: AuthRequest, res: Response) {
  try {
    const { teamId, status, notes } = req.body as {
      teamId: number;
      status: 'approved' | 'rejected';
      notes?: string;
    };

    const team = await prisma.team.findUnique({ 
      where: { id: teamId },
      include: { leader: true }
    });
    
    if (!team) return notFound(res, 'Team not found.');

    const newStatusCode = status === 'approved' ? 'PAID' : 'REJECTED_PAYMENT';
    let statusRecord = await prisma.status.findUnique({ where: { code: newStatusCode } });

    if (!statusRecord) {
      statusRecord = await prisma.status.create({
        data: {
          code: newStatusCode,
          description: status === 'approved' ? 'Payment verified and approved' : 'Payment rejected by finance',
        },
      });
    }

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: { status: statusRecord.id },
      include: { statuscode: true, leader: true },
    });

    if (req.user?.id) {
      await prisma.activityLog.create({
        data: {
          staffId: req.user.id,
          activity: `Payment verification for team ${team.name}: ${status}${notes ? ` - ${notes}` : ''}`,
          status: status,
        },
      });
    }

    // IBCC-07: Generate access code if approved and notify
    if (team.leader?.email) {
      if (status === 'approved') {
        // Generate Access Code
        await prisma.accessCode.updateMany({
          where: { teamId },
          data: { expiresAt: new Date() },
        });

        const code = generateCode();
        
        // Expiry 7 days for semifinal access
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.accessCode.create({
          data: {
            teamId,
            code,
            expiresAt
          }
        });

        const subject = '[SXC Intersummit 2026] Payment Verified & Semifinal Access Code';
        const contentHtml = `
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Congratulations, ${team.leader.name}!</h2>
          <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
            Your payment for team <strong>${team.name}</strong> has been successfully verified by our finance committee.
          </p>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 6px 0; color: #166534; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Your Semifinal Access Code</p>
            <div style="display: inline-block; padding: 10px 24px; background-color: #ffffff; border: 2px dashed #10b981; border-radius: 8px; font-size: 26px; font-weight: 800; letter-spacing: 4px; color: #065f46;">
              ${code}
            </div>
            <p style="margin: 10px 0 0 0; color: #15803d; font-size: 13px;">Team ID: <strong>${team.id}</strong></p>
          </div>
          <p style="margin: 16px 0 0 0; line-height: 1.6; color: #475569; font-size: 14px;">
            Please keep this code confidential. You will need your Team ID and this Access Code to log in and upload your Semifinal slide deck on the summit portal.
          </p>
        `;
        const html = renderEmailTemplate({
          title: "Payment Verified",
          headerHeading: "Payment Verified",
          contentHtml,
        });

        const mailResult = await sendMail({ to: team.leader.email, subject, html });
        
        await prisma.emailLog.create({
          data: {
            toEmail: team.leader.email,
            subject,
            template: 'payment_approved_access_code',
            status: mailResult.success ? 'success' : 'failed'
          }
        });
      } else {
        const subject = '[SXC Intersummit 2026] Payment Rejected';
        const contentHtml = `
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, ${team.leader.name}</h2>
          <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
            Unfortunately, your payment verification for team <strong>${team.name}</strong> was rejected by our finance committee.
          </p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: 600;">Notes from Finance:</p>
            <p style="margin: 4px 0 0 0; color: #b91c1c; font-size: 13px;">${notes || 'Please re-upload a clear proof of payment.'}</p>
          </div>
          <p style="margin: 16px 0 0 0; line-height: 1.6; color: #475569; font-size: 14px;">
            Please log in to your participant dashboard and upload a valid proof of transfer.
          </p>
        `;
        const html = renderEmailTemplate({
          title: "Payment Rejected",
          headerHeading: "Payment Rejected",
          contentHtml,
        });

        const mailResult = await sendMail({ to: team.leader.email, subject, html });
        
        await prisma.emailLog.create({
          data: {
            toEmail: team.leader.email,
            subject,
            template: 'payment_rejected',
            status: mailResult.success ? 'success' : 'failed'
          }
        });
      }
    }

    return ok(res, updatedTeam, 'Payment verification processed successfully.');
  } catch (error: any) {
    console.error('[FINANCE] verifyPayment error:', error.message);
    return internalError(res, 'Failed to verify payment.');
  }
}

// POST /finance/requirement/verify
export async function verifyRequirement(req: AuthRequest, res: Response) {
  try {
    const { teamId, type, status, notes } = req.body as {
      teamId: number;
      type: 'twibbon' | 'story';
      status: 'approved' | 'rejected';
      notes?: string;
    };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, 'Team not found.');

    const newStatusCode = status === 'approved' ? `REQ_${type.toUpperCase()}_OK` : `REQ_${type.toUpperCase()}_REJECTED`;
    let statusRecord = await prisma.status.findUnique({ where: { code: newStatusCode } });

    if (!statusRecord) {
      statusRecord = await prisma.status.create({
        data: {
          code: newStatusCode,
          description: status === 'approved' ? `${type} requirement approved` : `${type} requirement rejected`,
        },
      });
    }

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: { status: statusRecord.id },
      include: { statuscode: true, leader: true },
    });

    if (req.user?.id) {
      await prisma.activityLog.create({
        data: {
          staffId: req.user.id,
          activity: `Requirement (${type}) verification for team ${team.name}: ${status}${notes ? ` - ${notes}` : ''}`,
          status: status,
        },
      });
    }

    return ok(res, updatedTeam, `Requirement (${type}) ${status} successfully.`);
  } catch (error: any) {
    console.error('[FINANCE] verifyRequirement error:', error.message);
    return internalError(res, 'Failed to verify requirement.');
  }
}
