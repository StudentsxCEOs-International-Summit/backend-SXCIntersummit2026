import pino from 'pino'
import { env } from './env'

const isProduction = env.NODE_ENV === 'production'

const sensitivePaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.confirmPassword',
  'req.body.otp',
  'password',
  'confirmPassword',
  'otp',
  'accessCode',
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'CRON_SECRET',
  'SMTP_PASS',
  'SMTP_PASS_2',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN',
  'GOOGLE_DRIVE_REFRESH_TOKEN_2',
]

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: sensitivePaths,
    censor: '[REDACTED]',
  },
  ...(!isProduction && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
})

export function createChildLogger(
  context: string,
  extra: Record<string, unknown> = {},
) {
  return logger.child({
    ...extra,
    context,
  })
}

export default logger
