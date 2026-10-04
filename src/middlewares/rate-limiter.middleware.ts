import rateLimit from 'express-rate-limit'

// Defaults need tuning per-endpoint before production
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the RateLimit-* headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
  validate: { trustProxy: false },
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
})
