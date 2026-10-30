import { Request, Response } from 'express';
import { createChildLogger } from '../../configs/logger';

const ibccLogger = createChildLogger('IBCC');
import { AuthRequest } from '../../middlewares/auth.middleware';
import { cleanupUploadFiles } from '../../middlewares/clean-up-files.middleware';
import { ok, badRequest, conflict, notFound, forbidden, internalError } from '../../utils/response';
import { deleteFile } from '../../services/storage.service';
import { getEffectiveDeadline } from '../../configs/appConfig';
import {
  registerTeam,
  getMyTeam,
  submitPreliminarySlideDeck,
  submitSemifinalSlideDeck,
  submitPaymentProof,
  submitScore,
  getScores,
  publishResults,
  getAllTeamsForAdmin,
  evaluatePreliminaryRound,
  RegistrationUploadedFiles,
} from './ibcc.service';
import {
  RegisterTeamInput,
  SubmitScoreInput,
  PublishResultsInput,
  UpdatePreliminaryStatusInput,
} from './ibcc.schema';

const REQUIRED_UPLOAD_FIELDS = [
  'ktm_file',
  'follow_proof',
  'twibbon_proof',
  'poster_proof',
  'broadcast_proof',
] as const;

export async function registerTeamHandler(req: AuthRequest, res: Response) {
  try {
    const leaderUser = req.user;
    if (!leaderUser?.id) {
      return badRequest(res, 'Leader identity not found in authentication token.');
    }

    // Judged by when the request arrived, so a slow upload that started before the deadline counts.
    const receivedAt: Date = res.locals.receivedAt ?? new Date();
    if (receivedAt >= getEffectiveDeadline()) {
      cleanupUploadFiles(new Error('Registration closed'), req, res, () => {});
      return forbidden(res, 'Registration is closed.');
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const missingFields: string[] = [];

    for (const field of REQUIRED_UPLOAD_FIELDS) {
      if (!files?.[field] || files[field].length === 0) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      cleanupUploadFiles(new Error('Missing required files'), req, res, () => {});
      return badRequest(
        res,
        `All 5 registration files are required. Missing: ${missingFields.join(', ')}`,
      );
    }

    const input = req.body as RegisterTeamInput;
    const registrationFiles = files as unknown as RegistrationUploadedFiles;

    const data = await registerTeam(
      {
        id: Number(leaderUser.id),
        email: leaderUser.email,
        name: leaderUser.name || 'Team Leader',
      },
      input,
      registrationFiles,
      receivedAt,
    );

    return ok(res, data, 'Team successfully registered for IBCC 2026!', 201);
  } catch (error: any) {
    cleanupUploadFiles(error, req, res, () => {});
    const message = error.message || 'Failed to register team.';

    if (
      message.includes('already taken') ||
      message.includes('already registered') ||
      message.includes('already in an IBCC team') ||
      message.includes('Duplicate member')
    ) {
      return conflict(res, message);
    }

    if (message.includes('pool') || message.includes('No available team codes')) {
      return badRequest(res, message);
    }

    return internalError(res, message);
  }
}

export async function getMyTeamHandler(req: AuthRequest, res: Response) {
  try {
    const userId = Number(req.user?.id);
    if (!userId) {
      return badRequest(res, 'User identity not found in token.');
    }

    const data = await getMyTeam(userId);
    if (!data) {
      return notFound(res, 'No registered team found for this user.');
    }

    return ok(res, data, 'Team details retrieved successfully.');
  } catch (error: any) {
    return internalError(res, error.message || 'Failed to retrieve team details.');
  }
}

export async function submitPreliminaryHandler(req: AuthRequest, res: Response) {
  try {
    const leaderUser = req.user;
    if (!leaderUser?.id) {
      return badRequest(res, 'Leader identity not found in authentication token.');
    }

    const file = req.file;
    if (!file) {
      return badRequest(res, 'No slide deck file uploaded. Please attach a PDF or PPTX file.');
    }

    const teamId = req.body.teamId ? Number(req.body.teamId) : undefined;

    const data = await submitPreliminarySlideDeck(Number(leaderUser.id), file, teamId, res.locals.receivedAt);
    return ok(res, data, 'Preliminary slide deck submitted successfully.', 201);
  } catch (error: any) {
    if (req.file?.path) {
      deleteFile(req.file.path);
    }
    const message = error.message || 'Failed to submit preliminary slide deck.';
    if (message.includes('not the leader') || message.includes('not found')) {
      return forbidden(res, message);
    }
    return internalError(res, message);
  }
}

export async function submitSemifinalHandler(req: AuthRequest, res: Response) {
  try {
    const leaderUser = req.user;
    if (!leaderUser?.id) {
      return badRequest(res, 'Leader identity not found in authentication token.');
    }

    const file = req.file;
    if (!file) {
      return badRequest(res, 'No slide deck file uploaded. Please attach a PDF or PPTX file.');
    }

    const teamId = req.body.teamId ? Number(req.body.teamId) : undefined;
    const data = await submitSemifinalSlideDeck(Number(leaderUser.id), file, teamId, res.locals.receivedAt);

    return ok(res, data, 'Semifinal slide deck submitted successfully.', 201);
  } catch (error: any) {
    if (req.file?.path) {
      deleteFile(req.file.path);
    }
    const message = error.message || 'Failed to submit semifinal slide deck.';
    if (
      message.includes('not the leader') ||
      message.includes('not found') ||
      message.includes('advanced to the semifinal')
    ) {
      return forbidden(res, message);
    }
    return internalError(res, message);
  }
}

export async function submitPaymentHandler(req: AuthRequest, res: Response) {
  try {
    const leaderUser = req.user;
    if (!leaderUser?.id) {
      return badRequest(res, 'Leader identity not found in authentication token.');
    }

    const file = req.file;
    if (!file) {
      return badRequest(res, 'No payment proof uploaded. Please attach an image or PDF file.');
    }

    const teamId = req.body.teamId ? Number(req.body.teamId) : undefined;
    const data = await submitPaymentProof(Number(leaderUser.id), file, teamId, res.locals.receivedAt);

    return ok(res, data, 'Payment proof received and is being processed.', 201);
  } catch (error: any) {
    if (req.file?.path) {
      deleteFile(req.file.path);
    }
    const message = error.message || 'Failed to submit payment proof.';
    if (
      message.includes('not the leader') ||
      message.includes('not found') ||
      message.includes('advanced to the semifinal')
    ) {
      return forbidden(res, message);
    }
    return internalError(res, message);
  }
}

export async function submitScoreHandler(req: AuthRequest, res: Response) {
  try {
    const judgeId = req.user?.id;
    if (!judgeId) {
      return badRequest(res, 'Judge identity not found in token.');
    }

    const { teamId, score, comment } = req.body as SubmitScoreInput;
    const result = await submitScore(Number(judgeId), teamId, score, comment);

    return ok(
      res,
      { semifinalScore: result.semifinalScore },
      result.isUpdated ? 'Score updated successfully.' : 'Score submitted successfully.',
      result.isUpdated ? 200 : 201,
    );
  } catch (error: any) {
    const message = error.message || 'Failed to submit score.';
    if (message.includes('not found')) {
      return notFound(res, message);
    }
    return internalError(res, message);
  }
}

export async function getScoresHandler(_req: AuthRequest, res: Response) {
  try {
    const data = await getScores();
    return ok(res, data, 'Semifinal scores retrieved.');
  } catch (error: any) {
    return internalError(res, error.message || 'Failed to retrieve scores.');
  }
}

export async function publishResultsHandler(req: AuthRequest, res: Response) {
  try {
    const { qualifiedTeamIds } = req.body as PublishResultsInput;
    const result = await publishResults(qualifiedTeamIds);

    return ok(
      res,
      result,
      `Results published. ${result.qualified.length} teams qualified, ${result.eliminated.length} teams eliminated. Notification emails are being processed.`,
    );
  } catch (error: any) {
    return internalError(res, error.message || 'Failed to publish results.');
  }
}

export async function getAdminTeamsHandler(_req: AuthRequest, res: Response) {
  try {
    const teams = await getAllTeamsForAdmin();
    return ok(res, teams, 'Teams retrieved successfully.');
  } catch (error: any) {
    ibccLogger.error({ err: error, msg: 'getAdminTeamsHandler failed' });
    return internalError(res, 'Failed to retrieve teams.');
  }
}

export async function updatePreliminaryStatusHandler(req: AuthRequest, res: Response) {
  try {
    const teamId = Number(req.params.teamId);
    const { status, feedback, score } = req.body as UpdatePreliminaryStatusInput;

    const updatedTeam = await evaluatePreliminaryRound(
      teamId,
      status,
      feedback,
      score,
      req.user?.id ? Number(req.user.id) : undefined,
    );

    return ok(res, updatedTeam, 'Preliminary status updated successfully.');
  } catch (error: any) {
    ibccLogger.error({ err: error, teamId: req.params?.teamId, msg: 'updatePreliminaryStatusHandler failed' });
    if (error.message?.includes('not found')) {
      return notFound(res, error.message);
    }
    return internalError(res, error.message || 'Failed to update preliminary status.');
  }
}


