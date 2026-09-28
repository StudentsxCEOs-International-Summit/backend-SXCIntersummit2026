import { Router } from 'express'
import authRouter from '../features/auth/auth.route'

const routes = Router()

routes.use('/auth', authRouter)

export default routes
