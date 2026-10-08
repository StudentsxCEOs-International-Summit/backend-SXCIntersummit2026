import { Request, Response } from "express";
import prisma from "../../configs/db";
import { ok, badRequest, internalError, notFound } from "../../utils/response";
import { uploadFileToDrive } from "../../services/storage.service";

// POST /upload/payment (IBCC-06)
export async function uploadPaymentProof(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return badRequest(res, "No file uploaded. Please attach a payment proof image.");

    const teamId = Number(req.body.teamId);
    if (!teamId) return badRequest(res, "teamId is required.");

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    const fileUrl = await uploadFileToDrive(file);

    const submission = await prisma.submission.create({
      data: {
        teamId,
        stage: "REGISTRATION",
        event: "IBCC",
        type: "PAYMENT",
        Files: {
          create: {
            filePath: fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
          },
        },
      },
      include: { Files: true },
    });

    return ok(res, { submission }, "Payment proof uploaded successfully.", 201);
  } catch (error: any) {
    console.error("[UPLOAD] uploadPaymentProof error:", error.message);
    return internalError(res, "Failed to upload payment proof.");
  }
}

// POST /upload/requirement (twibbon / story)
export async function uploadRequirementProof(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return badRequest(res, "No file uploaded. Please attach a requirement proof image.");

    const teamId = Number(req.body.teamId);
    const type = req.body.type as string; // "twibbon" | "story"
    if (!teamId) return badRequest(res, "teamId is required.");

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    const fileUrl = await uploadFileToDrive(file);

    const submission = await prisma.submission.create({
      data: {
        teamId,
        stage: "REGISTRATION",
        event: `IBCC-requirement-${type}`,
        type: "PROMOTION",
        Files: {
          create: {
            filePath: fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
          },
        },
      },
      include: { Files: true },
    });

    return ok(res, { submission }, `Requirement proof (${type}) uploaded successfully.`, 201);
  } catch (error: any) {
    console.error("[UPLOAD] uploadRequirementProof error:", error.message);
    return internalError(res, "Failed to upload requirement proof.");
  }
}

// POST /upload/slides (IBCC-09)
export async function uploadSlideDeck(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return badRequest(res, "No file uploaded. Please attach a slide deck (PDF/PPTX).");

    const teamId = Number(req.body.teamId);
    if (!teamId) return badRequest(res, "teamId is required.");

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    const fileUrl = await uploadFileToDrive(file);

    // Save to SlideDeck model
    const slideDeck = await prisma.slideDeck.create({
      data: {
        teamId,
        fileUrl,
      },
    });

    // Also create a Submission record
    const submission = await prisma.submission.create({
      data: {
        teamId,
        stage: "SEMIFINAL",
        event: "IBCC",
        type: "TASK",
        Files: {
          create: {
            filePath: fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
          },
        },
      },
      include: { Files: true },
    });

    return ok(
      res,
      { slideDeck, submission },
      "Slide deck uploaded successfully (max 5 slides).",
      201,
    );
  } catch (error: any) {
    console.error("[UPLOAD] uploadSlideDeck error:", error.message);
    return internalError(res, "Failed to upload slide deck.");
  }
}
