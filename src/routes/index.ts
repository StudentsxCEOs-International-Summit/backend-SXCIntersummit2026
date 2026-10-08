import { Router } from 'express'
import authRouter from '../features/auth/auth.route'
import uploadRouter from '../features/upload/upload.route'
import financeRouter from '../features/finance/finance.route'
import accessCodeRouter from '../features/accesscode/accesscode.route'
import semifinalRouter from '../features/semifinal/semifinal.route'
import configRouter from '../features/config/config.route'
import competitionRouter from '../features/competition/competition.route'

const routes = Router()

routes.use('/auth', authRouter)
routes.use('/upload', uploadRouter)
routes.use('/finance', financeRouter)
routes.use('/access-code', accessCodeRouter)
routes.use('/semifinal', semifinalRouter)
routes.use('/config', configRouter)
routes.use('/admin/competition', competitionRouter)

export default routes
