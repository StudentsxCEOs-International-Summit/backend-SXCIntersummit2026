import { Router, Request, Response } from 'express'
import { requireCronSecret } from '../middlewares/cron.middleware'
import { triggerEmailScheduler } from '../jobs/email-scheduler.job'
import { triggerTokenCleanup } from '../jobs/token-cleanup.job'
import { ok, internalError } from '../utils/response'

const cronRouter = Router()

// All cron routes require the x-cron-secret header
cronRouter.use(requireCronSecret)

/**
 * GET /api/cron/email-scheduler
 * Triggers deadline & payment reminder emails.
 */
cronRouter.get('/email-scheduler', async (_req: Request, res: Response) => {
  try {
    console.log('[CRON] Email scheduler triggered via HTTP')
    const result = await triggerEmailScheduler()
    return ok(res, result, 'Email scheduler executed successfully')
  } catch (error: any) {
    console.error('[CRON] Email scheduler failed:', error.message)
    return internalError(res, 'Email scheduler failed', error.message)
  }
})

/**
 * GET /api/cron/token-cleanup
 * Purges expired blacklisted tokens.
 */
cronRouter.get('/token-cleanup', async (_req: Request, res: Response) => {
  try {
    console.log('[CRON] Token cleanup triggered via HTTP')
    const result = await triggerTokenCleanup()
    return ok(res, result, 'Token cleanup executed successfully')
  } catch (error: any) {
    console.error('[CRON] Token cleanup failed:', error.message)
    return internalError(res, 'Token cleanup failed', error.message)
  }
})

export default cronRouter
