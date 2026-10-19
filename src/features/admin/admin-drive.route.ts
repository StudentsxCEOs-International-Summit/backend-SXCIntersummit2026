import { Router } from 'express'
import * as AdminDriveController from './admin-drive.controller'

const adminDriveRouter = Router()

adminDriveRouter.get('/setup', AdminDriveController.adminDriveSetupRedirect)
adminDriveRouter.get('/callback', AdminDriveController.adminDriveCallback)

export default adminDriveRouter
