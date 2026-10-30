import { Router } from 'express'
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware'
import * as AdminDriveController from './admin-drive.controller'

const adminDriveRouter = Router()

// Drive setup mints the committee account's refresh token, so only a signed-in admin may run it.
adminDriveRouter.get('/setup', requireAuth, requireAdmin, AdminDriveController.adminDriveSetupRedirect)
adminDriveRouter.get('/callback', requireAuth, requireAdmin, AdminDriveController.adminDriveCallback)

export default adminDriveRouter
