import rateLimit from 'express-rate-limit'
import { env } from '../configs/env'

const skipCron = (req: { headers: Record<string, unknown> }) => {
  const secret = req.headers['x-cron-secret']
  return Boolean(secret && env.CRON_SECRET && secret === env.CRON_SECRET)
}

/**
 * Flood guard only. Whole campuses and offices share one public IP, and a page load plus
 * status polling is dozens of requests, so this is deliberately loose (about 200 requests a
 * minute per IP) to avoid locking out real participants at the registration deadline.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: skipCron,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
})

/** Login, OTP and password-reset endpoints: guards guessing and email spam, still shared-IP friendly. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: skipCron,
  message: {
    success: false,
    message: 'Too many attempts, please try again in a few minutes.',
  },
})

/** Public Contact form: a handful of enquiries per hour per IP is plenty and keeps spam out of the inbox. */
export const contactRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: skipCron,
  message: {
    success: false,
    message: 'Too many messages from this connection. Please try again later.',
  },
})
