import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validation.middleware';
import {
  uploadRegistrationRequirements,
  uploadPreliminarySlideDeck,
} from '../../services/storage.service';
import {
  registerTeamHandler,
  verifyMemberTokenHandler,
  claimMemberAccountHandler,
  getMyTeamHandler,
  submitPreliminaryHandler,
} from './ibcc.controller';
import {
  registerTeamSchema,
  verifyMemberTokenQuerySchema,
  claimMemberAccountSchema,
} from './ibcc.schema';

const ibccRouter = Router();

ibccRouter.post(
  '/register',
  requireAuth,
  uploadRegistrationRequirements,
  validateRequest({ body: registerTeamSchema }),
  registerTeamHandler,
);

ibccRouter.get('/my-team', requireAuth, getMyTeamHandler);

ibccRouter.get(
  '/members/verify-token',
  validateRequest({ query: verifyMemberTokenQuerySchema }),
  verifyMemberTokenHandler,
);

ibccRouter.post(
  '/members/claim-account',
  validateRequest({ body: claimMemberAccountSchema }),
  claimMemberAccountHandler,
);

ibccRouter.post(
  '/submission/preliminary',
  requireAuth,
  uploadPreliminarySlideDeck,
  submitPreliminaryHandler,
);

export default ibccRouter;
