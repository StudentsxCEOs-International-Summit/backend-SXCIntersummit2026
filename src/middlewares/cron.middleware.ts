import { Request, Response, NextFunction } from 'express'
import { env } from '../configs/env'
import { unauthorized } from '../utils/response'
import { createChildLogger } from '../configs/logger'

const cronLogger = createChildLogger('CRON')

/**
 * Middleware to validate cron requests from cronjob.org (or similar services).
 * Checks the `x-cron-secret` header against the CRON_SECRET env variable.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-cron-secret'] as string | undefined

  if (!env.CRON_SECRET) {
    cronLogger.warn('CRON_SECRET is not set: cron endpoints are disabled')
    return unauthorized(res, 'Cron endpoints are not configured')
  }

  if (!secret || secret !== env.CRON_SECRET) {
    cronLogger.warn({ clientIp: req.ip }, 'Unauthorized cron request')
    return unauthorized(res, 'Invalid cron secret')
  }

  next()
}
