import { Request, Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { cleanupUploadFiles } from '../../middlewares/clean-up-files.middleware';
import { ok, badRequest, conflict, notFound, forbidden, internalError } from '../../utils/response';
import { deleteFile } from '../../services/storage.service';
import {
  registerTeam,
  verifyMemberToken,
  claimMemberAccount,
  getMyTeam,
  submitPreliminarySlideDeck,
  RegistrationUploadedFiles,
} from './ibcc.service';
import { RegisterTeamInput, ClaimMemberAccountInput } from './ibcc.schema';

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

export async function verifyMemberTokenHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return badRequest(res, 'Activation token is required.');
    }

    const data = await verifyMemberToken(token);
    return ok(res, data, 'Token is valid.');
  } catch (error: any) {
    return badRequest(res, error.message || 'Failed to verify token.');
  }
}

export async function claimMemberAccountHandler(req: Request, res: Response) {
  try {
    const { token, password } = req.body as ClaimMemberAccountInput;

    const data = await claimMemberAccount(token, password);
    return ok(res, data, 'Account successfully activated! Welcome to the team.');
  } catch (error: any) {
    return badRequest(res, error.message || 'Failed to claim account.');
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

    const data = await submitPreliminarySlideDeck(Number(leaderUser.id), file, teamId);
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
