import { Router, Request, Response } from 'express'
import { requireCronSecret } from '../middlewares/cron.middleware'
import { triggerEmailScheduler } from '../jobs/email-scheduler.job'
import { triggerTokenCleanup } from '../jobs/token-cleanup.job'
import { createChildLogger } from '../configs/logger'
import { ok, internalError } from '../utils/response'

const cronLogger = createChildLogger('CRON')

const cronRouter = Router()

// All cron routes require the x-cron-secret header
cronRouter.use(requireCronSecret)

/**
 * GET /api/cron/email-scheduler
 * Triggers deadline & payment reminder emails.
 */
cronRouter.get('/email-scheduler', async (_req: Request, res: Response) => {
  try {
    cronLogger.info('Email scheduler triggered via HTTP')
    const result = await triggerEmailScheduler()
    return ok(res, result, 'Email scheduler executed successfully')
  } catch (error: any) {
    cronLogger.error({ err: error }, 'Email scheduler failed')
    return internalError(res, 'Email scheduler failed')
  }
})

/**
 * GET /api/cron/token-cleanup
 * Purges expired blacklisted tokens.
 */
cronRouter.get('/token-cleanup', async (_req: Request, res: Response) => {
  try {
    cronLogger.info('Token cleanup triggered via HTTP')
    const result = await triggerTokenCleanup()
    return ok(res, result, 'Token cleanup executed successfully')
  } catch (error: any) {
    cronLogger.error({ err: error }, 'Token cleanup failed')
    return internalError(res, 'Token cleanup failed')
  }
})

export default cronRouter
