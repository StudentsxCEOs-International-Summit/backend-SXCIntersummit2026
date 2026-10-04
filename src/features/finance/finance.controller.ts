import { Request, Response } from "express";
import prisma from "../../configs/db";
import { ok, badRequest, internalError, notFound } from "../../utils/response";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { notifyStatusChange } from "../status/status.service";

// POST /finance/verify (ADMIN-02)
// Verify payment proof submitted by a team
export async function verifyPayment(req: AuthRequest, res: Response) {
  try {
    const { teamId, status, notes } = req.body as {
      teamId: number;
      status: "approved" | "rejected";
      notes?: string;
    };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    // Determine new status code based on approval
    // Using status code convention: lookup the 'PAID' or 'REJECTED_PAYMENT' code
    const newStatusCode = status === "approved" ? "PAID" : "REJECTED_PAYMENT";

    // Try to find the status record, fall back to updating with a description
    let statusRecord = await prisma.status.findUnique({ where: { code: newStatusCode } });

    if (!statusRecord) {
      // Create the status if it doesn't exist
      statusRecord = await prisma.status.create({
        data: {
          code: newStatusCode,
          description:
            status === "approved"
              ? "Payment verified and approved"
              : "Payment rejected by finance",
        },
      });
    }

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: { status: statusRecord.id },
      include: { statuscode: true, leader: true },
    });

    // Log activity
    if (req.user?.id) {
      await prisma.activityLog.create({
        data: {
          staffId: req.user.id,
          activity: `Payment verification for team ${team.name}: ${status}${notes ? ` – ${notes}` : ""}`,
          status: status,
        },
      });
    }

    // Trigger email notification
    await notifyStatusChange(teamId, newStatusCode, "payment_verification");

    return ok(res, { team: updatedTeam }, `Payment ${status} successfully.`);
  } catch (error: any) {
    console.error("[FINANCE] verifyPayment error:", error.message);
    return internalError(res, "Failed to verify payment.");
  }
}

// POST /finance/requirement/verify
// Verify requirement (twibbon/story) submission
export async function verifyRequirement(req: AuthRequest, res: Response) {
  try {
    const { teamId, type, status, notes } = req.body as {
      teamId: number;
      type: "twibbon" | "story";
      status: "approved" | "rejected";
      notes?: string;
    };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    const newStatusCode =
      status === "approved" ? `REQ_${type.toUpperCase()}_OK` : `REQ_${type.toUpperCase()}_REJECTED`;

    let statusRecord = await prisma.status.findUnique({ where: { code: newStatusCode } });

    if (!statusRecord) {
      statusRecord = await prisma.status.create({
        data: {
          code: newStatusCode,
          description:
            status === "approved"
              ? `${type} requirement approved`
              : `${type} requirement rejected`,
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
          activity: `Requirement (${type}) verification for team ${team.name}: ${status}${notes ? ` – ${notes}` : ""}`,
          status: status,
        },
      });
    }

    await notifyStatusChange(teamId, newStatusCode, "requirement_verification");

    return ok(res, { team: updatedTeam }, `Requirement (${type}) ${status} successfully.`);
  } catch (error: any) {
    console.error("[FINANCE] verifyRequirement error:", error.message);
    return internalError(res, "Failed to verify requirement.");
  }
}
