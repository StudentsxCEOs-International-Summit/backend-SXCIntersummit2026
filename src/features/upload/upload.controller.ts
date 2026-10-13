import { Request, Response } from "express";
import path from "path";
import prisma from "../../configs/db";
import { env } from "../../configs/env";
import { ok, badRequest, internalError, notFound } from "../../utils/response";
import { uploadBufferToDrive } from "../../services/storage.service";

async function resolveTeamFromRequest(req: Request) {
  const authUser = (req as any).user;
  const teamIdInput = req.body.teamId ? Number(req.body.teamId) : undefined;

  if (teamIdInput) {
    const team = await prisma.team.findUnique({ where: { id: teamIdInput } });
    if (team) return team;
  }

  if (authUser?.id) {
    return prisma.team.findFirst({
      where: {
        OR: [
          { leaderId: authUser.id },
          { TeamMember: { some: { userId: authUser.id } } },
        ],
      },
    });
  }

  return null;
}

export async function uploadPaymentProof(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return badRequest(res, "No file uploaded. Please attach a payment proof image.");

    const team = await resolveTeamFromRequest(req);
    if (!team) return notFound(res, "No registered team found for this authenticated user.");
    const teamId = team.id;

    const targetFolderId =
      env.GOOGLE_DRIVE_FOLDER_PAYMENT_ID ||
      env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
      env.GOOGLE_DRIVE_FOLDER_ID;

    if (!targetFolderId) {
      return internalError(res, "Google Drive Payment folder ID is not configured.");
    }

    const ext = path.extname(file.originalname) || ".jpg";
    const sanitizedTeamName = team.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `[${team.code}]_${sanitizedTeamName}_PaymentProof${ext}`;

    const uploadResult = await uploadBufferToDrive(
      file.buffer,
      fileName,
      file.mimetype,
      targetFolderId,
    );

    const submission = await prisma.submission.create({
      data: {
        teamId,
        stage: "REGISTRATION",
        event: "IBCC",
        type: "PAYMENT",
        Files: {
          create: {
            filePath: uploadResult.webViewLink,
            gdriveId: uploadResult.fileId,
            fileType: file.mimetype,
            fileSize: file.size,
          },
        },
      },
      include: { Files: true },
    });

    return ok(
      res,
      {
        submission,
        gdriveId: uploadResult.fileId,
        viewUrl: uploadResult.webViewLink,
      },
      "Payment proof uploaded successfully to Google Drive.",
      201,
    );
  } catch (error: any) {
    console.error("[UPLOAD] uploadPaymentProof error:", error.message);
    return internalError(res, `Failed to upload payment proof: ${error.message}`);
  }
}

// POST /upload/slides (IBCC-09)
export async function uploadSlideDeck(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return badRequest(res, "No file uploaded. Please attach a slide deck (PDF/PPTX).");

    const team = await resolveTeamFromRequest(req);
    if (!team) return notFound(res, "No registered team found for this authenticated user.");
    const teamId = team.id;

    const targetFolderId =
      env.GOOGLE_DRIVE_FOLDER_SEMIFINAL_SLIDES_ID ||
      env.GOOGLE_DRIVE_FOLDER_IBCC_ID ||
      env.GOOGLE_DRIVE_FOLDER_ID;

    if (!targetFolderId) {
      return internalError(res, "Google Drive Semifinal Slides folder ID is not configured.");
    }

    const ext = path.extname(file.originalname) || ".pdf";
    const sanitizedTeamName = team.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `[${team.code}]_${sanitizedTeamName}_Semifinal_Slides${ext}`;

    const uploadResult = await uploadBufferToDrive(
      file.buffer,
      fileName,
      file.mimetype,
      targetFolderId,
    );

    const slideDeck = await prisma.slideDeck.create({
      data: {
        teamId,
        fileUrl: uploadResult.webViewLink,
      },
    });

    const submission = await prisma.submission.create({
      data: {
        teamId,
        stage: "SEMIFINAL",
        event: "IBCC",
        type: "TASK",
        Files: {
          create: {
            filePath: uploadResult.webViewLink,
            gdriveId: uploadResult.fileId,
            fileType: file.mimetype,
            fileSize: file.size,
          },
        },
      },
      include: { Files: true },
    });

    return ok(
      res,
      {
        slideDeck,
        submission,
        gdriveId: uploadResult.fileId,
        viewUrl: uploadResult.webViewLink,
      },
      "Slide deck uploaded successfully to Google Drive (max 5 slides).",
      201,
    );
  } catch (error: any) {
    console.error("[UPLOAD] uploadSlideDeck error:", error.message);
    return internalError(res, `Failed to upload slide deck: ${error.message}`);
  }
}
