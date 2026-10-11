import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validation.middleware';
import { updatePreliminaryStatus, getDashboardTeams } from './competition.controller';
import { updatePreliminaryStatusSchema, teamIdParamSchema } from './competition.schema';

const router = Router();

// GET /competition/teams (Endpoint Dashboard)
router.get('/teams', requireAuth, requireAdmin, getDashboardTeams);

// PUT /competition/preliminary/:teamId (ADMIN-01)
router.put(
  '/preliminary/:teamId',
  requireAuth,
  requireAdmin,
  validateRequest({
    params: teamIdParamSchema,
    body: updatePreliminaryStatusSchema,
  }),
  updatePreliminaryStatus,
);

export default router;

