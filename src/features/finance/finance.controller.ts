import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../../configs/db';
import { ok, badRequest, internalError, notFound } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { sendMail } from '../../services/mail.service';

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
          action: 'VERIFY_PAYMENT',
          details: `Payment verification for team ${team.name}: ${status}${notes ? ` - ${notes}` : ''}`,
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
        const html = `<h3>Congratulations ${team.leader.name}!</h3>
          <p>Your payment for team <b>${team.name}</b> has been successfully verified.</p>
          <p>Here is your Semifinal Access Code: <b>${code}</b></p>
          <p>Please use this code along with your Team ID (${team.id}) to log in and upload your Semifinal slide deck.</p>
          <p>Keep this code secret!</p>`;

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
        const html = `<h3>Hi ${team.leader.name},</h3>
          <p>Unfortunately, your payment for team <b>${team.name}</b> was rejected by our finance team.</p>
          <p>Notes: ${notes || 'Please re-upload a clear proof of payment.'}</p>`;

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

    return ok(res, 'Payment verification processed successfully.', updatedTeam);
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
          action: 'VERIFY_REQUIREMENT',
          details: `Requirement (${type}) verification for team ${team.name}: ${status}${notes ? ` - ${notes}` : ''}`,
        },
      });
    }

    return ok(res, `Requirement (${type}) ${status} successfully.`, updatedTeam);
  } catch (error: any) {
    console.error('[FINANCE] verifyRequirement error:', error.message);
    return internalError(res, 'Failed to verify requirement.');
  }
}
