import { Request, Response } from "express";
import prisma from "../../configs/db";
import { ok, badRequest, internalError, notFound } from "../../utils/response";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { sendSemifinalResultEmails } from "../status/status.service";

// ─────────────────────────────────────────────
// POST /semifinal/score  (ADMIN-03)
// Judge submits a score for a team
// ─────────────────────────────────────────────
export async function submitScore(req: AuthRequest, res: Response) {
  try {
    const { teamId, score, comment } = req.body as {
      teamId: number;
      score: number;
      comment?: string;
    };

    const judgeId = req.user?.id;
    if (!judgeId) return badRequest(res, "Judge identity not found in token.");

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return notFound(res, "Team not found.");

    // Check if this judge already scored this team
    const existing = await prisma.semifinalScore.findFirst({
      where: { teamId, judgeId },
    });

    let semifinalScore;
    if (existing) {
      // Update existing score
      semifinalScore = await prisma.semifinalScore.update({
        where: { id: existing.id },
        data: { score, comment },
      });
    } else {
      semifinalScore = await prisma.semifinalScore.create({
        data: { teamId, judgeId, score, comment },
      });
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        staffId: judgeId,
        activity: `Scored team ${team.name}: ${score}/100${comment ? ` – ${comment}` : ""}`,
        status: "scored",
      },
    });

    return ok(
      res,
      { semifinalScore },
      existing
        ? "Score updated successfully."
        : "Score submitted successfully.",
      existing ? 200 : 201,
    );
  } catch (error: any) {
    console.error("[SEMIFINAL] submitScore error:", error.message);
    return internalError(res, "Failed to submit score.");
  }
}

// ─────────────────────────────────────────────
// GET /semifinal/scores
// Get all semifinal scores grouped by team
// ─────────────────────────────────────────────
export async function getScores(req: AuthRequest, res: Response) {
  try {
    const scores = await prisma.semifinalScore.findMany({
      include: {
        team: { select: { id: true, name: true } },
        judge: { select: { id: true, name: true } },
      },
      orderBy: { score: "desc" },
    });

    // Group scores by team and calculate average
    const teamScoresMap = new Map<
      number,
      { teamId: number; teamName: string; scores: { judgeId: number; judgeName: string; score: number; comment: string | null }[]; average: number }
    >();

    for (const s of scores) {
      if (!teamScoresMap.has(s.teamId)) {
        teamScoresMap.set(s.teamId, {
          teamId: s.teamId,
          teamName: s.team.name,
          scores: [],
          average: 0,
        });
      }
      const entry = teamScoresMap.get(s.teamId)!;
      entry.scores.push({
        judgeId: s.judgeId,
        judgeName: s.judge.name,
        score: s.score,
        comment: s.comment,
      });
    }

    // Calculate averages
    const result = Array.from(teamScoresMap.values()).map((entry) => {
      const avg =
        entry.scores.reduce((sum, s) => sum + s.score, 0) / entry.scores.length;
      return { ...entry, average: Math.round(avg * 100) / 100 };
    });

    result.sort((a, b) => b.average - a.average);

    return ok(res, { rankings: result }, "Semifinal scores retrieved.");
  } catch (error: any) {
    console.error("[SEMIFINAL] getScores error:", error.message);
    return internalError(res, "Failed to retrieve scores.");
  }
}

// ─────────────────────────────────────────────
// POST /semifinal/publish-results  (IBCC-10)
// Publish semifinal results & send emails
// ─────────────────────────────────────────────
export async function publishResults(req: AuthRequest, res: Response) {
  try {
    const { qualifiedTeamIds } = req.body as { qualifiedTeamIds: number[] };

    // Get all teams that participated in semifinal
    const allScoredTeamIds = await prisma.semifinalScore
      .findMany({ select: { teamId: true }, distinct: ["teamId"] })
      .then((rows: { teamId: number }[]) => rows.map((r: { teamId: number }) => r.teamId));

    const eliminatedTeamIds = allScoredTeamIds.filter(
      (id: number) => !qualifiedTeamIds.includes(id),
    );

    // Update status for qualified teams
    let qualifiedStatus = await prisma.status.findUnique({ where: { code: "QUALIFIED_FINAL" } });
    if (!qualifiedStatus) {
      qualifiedStatus = await prisma.status.create({
        data: { code: "QUALIFIED_FINAL", description: "Qualified to Final Round" },
      });
    }

    let eliminatedStatus = await prisma.status.findUnique({ where: { code: "ELIMINATED_SEMIFINAL" } });
    if (!eliminatedStatus) {
      eliminatedStatus = await prisma.status.create({
        data: { code: "ELIMINATED_SEMIFINAL", description: "Eliminated in Semifinal" },
      });
    }

    await prisma.team.updateMany({
      where: { id: { in: qualifiedTeamIds } },
      data: { status: qualifiedStatus.id },
    });

    await prisma.team.updateMany({
      where: { id: { in: eliminatedTeamIds } },
      data: { status: eliminatedStatus.id },
    });

    // Send emails (non-blocking)
    sendSemifinalResultEmails(qualifiedTeamIds, eliminatedTeamIds).catch((err) =>
      console.error("[SEMIFINAL] Email sending error:", err),
    );

    return ok(
      res,
      {
        qualified: qualifiedTeamIds,
        eliminated: eliminatedTeamIds,
      },
      `Results published. ${qualifiedTeamIds.length} teams qualified, ${eliminatedTeamIds.length} teams eliminated. Emails are being sent.`,
    );
  } catch (error: any) {
    console.error("[SEMIFINAL] publishResults error:", error.message);
    return internalError(res, "Failed to publish results.");
  }
}
