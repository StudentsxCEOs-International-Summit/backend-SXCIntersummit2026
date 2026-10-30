import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../../configs/db";
import { ok, badRequest, internalError, notFound } from "../../utils/response";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { notifyStatusChange } from "../ibcc/ibcc.status";
import { createChildLogger } from "../../configs/logger";

const accessCodeLogger = createChildLogger("ACCESS_CODE");

/**
 * Generate a cryptographically random 8-character alphanumeric access code.
 */
function generateCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars
}

// POST /access-code/generate (IBCC-07)
// Admin generates an access code for a team
export async function generateAccessCode(req: AuthRequest, res: Response) {
  try {
    const { teamId } = req.body as { teamId: number };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    // Expire old codes for this team
    await prisma.accessCode.updateMany({
      where: { teamId },
      data: { expiresAt: new Date() },
    });

    const code = generateCode();

    const accessCode = await prisma.accessCode.create({
      data: {
        teamId,
        code,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Send email notification about access code
    await notifyStatusChange(teamId, "ACCESS_CODE_GENERATED", "access_code");

    return ok(
      res,
      {
        teamId,
        teamName: team.name,
        accessCode: accessCode.code,
        expiresAt: accessCode.expiresAt,
      },
      "Access code generated successfully.",
      201,
    );
  } catch (error: any) {
    accessCodeLogger.error({ err: error, teamId: req.body?.teamId }, "Access code generation error");
    return internalError(res, "Failed to generate access code.");
  }
}

// POST /access-code/login (IBCC-08)
// Semifinal login with Team ID + Access Code
export async function loginWithAccessCode(req: Request, res: Response) {
  try {
    const { teamId, accessCode } = req.body as {
      teamId: number;
      accessCode: string;
    };

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { leader: true, statuscode: true },
    });

    if (!team) return notFound(res, "Team not found.");

    // Look up valid (non-expired) access code
    const codeRecord = await prisma.accessCode.findFirst({
      where: {
        teamId,
        code: accessCode.toUpperCase(),
        expiresAt: { gt: new Date() },
      },
    });

    if (!codeRecord) {
      return badRequest(res, "Invalid or expired access code.");
    }

    return ok(
      res,
      {
        team: {
          id: team.id,
          name: team.name,
          status: team.statuscode?.description || "N/A",
          leader: {
            id: team.leader.id,
            name: team.leader.name,
            email: team.leader.email,
          },
        },
        accessCode: codeRecord.code,
        message: "Semifinal login successful.",
      },
      "Semifinal login successful.",
    );
  } catch (error: any) {
    accessCodeLogger.error({ err: error }, "Access code authentication error");
    return internalError(res, "Failed to authenticate with access code.");
  }
}
