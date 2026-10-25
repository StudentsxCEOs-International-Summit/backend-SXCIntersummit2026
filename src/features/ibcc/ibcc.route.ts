import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validation.middleware';
import {
  uploadRegistrationRequirements,
  uploadPreliminarySlideDeck,
  uploadSlides,
  uploadPayment,
} from '../../services/storage.service';
import {
  registerTeamHandler,
  getMyTeamHandler,
  submitPreliminaryHandler,
  submitSemifinalHandler,
  submitPaymentHandler,
  submitScoreHandler,
  getScoresHandler,
  publishResultsHandler,
  getAdminTeamsHandler,
  updatePreliminaryStatusHandler,
} from './ibcc.controller';
import {
  registerTeamSchema,
  submitScoreSchema,
  publishResultsSchema,
  teamIdParamSchema,
  updatePreliminaryStatusSchema,
} from './ibcc.schema';

const ibccRouter = Router();

// Team registration and team dashboard
ibccRouter.post(
  '/register',
  requireAuth,
  uploadRegistrationRequirements,
  validateRequest({ body: registerTeamSchema }),
  registerTeamHandler,
);

ibccRouter.get('/my-team', requireAuth, getMyTeamHandler);

// Participant file submissions
ibccRouter.post(
  '/submission/preliminary',
  requireAuth,
  uploadPreliminarySlideDeck,
  submitPreliminaryHandler,
);

ibccRouter.post(
  '/submission/semifinal',
  requireAuth,
  uploadSlides.single('file'),
  submitSemifinalHandler,
);

ibccRouter.post(
  '/submission/payment',
  requireAuth,
  uploadPayment.single('file'),
  submitPaymentHandler,
);

// Semifinal scoring and results
ibccRouter.post(
  '/semifinal/score',
  requireAuth,
  requireAdmin,
  validateRequest({ body: submitScoreSchema }),
  submitScoreHandler,
);

ibccRouter.get(
  '/semifinal/scores',
  requireAuth,
  requireAdmin,
  getScoresHandler,
);

ibccRouter.post(
  '/semifinal/publish-results',
  requireAuth,
  requireAdmin,
  validateRequest({ body: publishResultsSchema }),
  publishResultsHandler,
);

// Admin team management and preliminary round evaluation
ibccRouter.get(
  '/admin/teams',
  requireAuth,
  requireAdmin,
  getAdminTeamsHandler,
);

ibccRouter.put(
  '/admin/preliminary/:teamId',
  requireAuth,
  requireAdmin,
  validateRequest({
    params: teamIdParamSchema,
    body: updatePreliminaryStatusSchema,
  }),
  updatePreliminaryStatusHandler,
);

export default ibccRouter;

