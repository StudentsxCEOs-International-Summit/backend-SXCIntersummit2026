import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import swaggerUi from 'swagger-ui-express'
import pinoHttp from 'pino-http'
import crypto from 'crypto'
import { env } from './configs/env'
import { logger } from './configs/logger'
import { errorHandler } from './middlewares/error.middleware'
import { notFound } from './middlewares/not-found.middleware'
import { apiRateLimiter } from './middlewares/rate-limiter.middleware'
import { swaggerSpec, swaggerUiOptions } from './docs/swagger'
import { startTokenCleanupJob } from './jobs/token-cleanup.job'
import { startEmailSchedulerJob } from './jobs/email-scheduler.job'
import { startDriveUploadWorker } from './jobs/drive-upload.job'
import routes from './routes'
import path from 'path'

const app = express()

// Number of reverse proxies in front of the app (nginx = 1, Cloudflare + nginx = 2); `true` would
// let clients spoof their IP through X-Forwarded-For and dodge the rate limiter.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1))

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }),
)

const allowedOrigins = env.CORS_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) || []

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }),
)

app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} completed with ${res.statusCode}`,
    customErrorMessage: (req, _res, err) => `${req.method} ${req.url} failed: ${err.message}`,
  }),
)

// Files waiting for their Drive upload (ID cards, payment proofs) must never be served from here.
app.use('/uploads/pending', (_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' })
})
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))
app.use('/public', express.static(path.resolve(process.cwd(), 'public')))

if (env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions))
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })
}

app.use('/api', apiRateLimiter)

app.get('/', (_req, res) => {
  if (env.NODE_ENV === 'production') {
    return res.redirect('https://sxcinternationalsummit.com')
  }

  return res.json({
    message: 'API SXC Intersummit 2026 is running',
    docs: `${env.APP_URL}/api-docs`,
  })
})

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

if (env.NODE_ENV !== 'test') {
  startTokenCleanupJob()
  startEmailSchedulerJob()
  startDriveUploadWorker()

  const server = app.listen(env.PORT, () => {
    logger.info({
      context: 'SYSTEM',
      port: env.PORT,
      appUrl: env.APP_URL,
      nodeEnv: env.NODE_ENV,
      appEnv: env.APP_ENV,
      msg: `API running at ${env.APP_URL}`,
    })
    if (env.NODE_ENV !== 'production') {
      logger.info({ context: 'SYSTEM', msg: `Swagger docs available at ${env.APP_URL}/api-docs` })
    }
  })

  // Node cuts a request that is still arriving after 5 minutes by default; 50 MB over a weak
  // mobile connection can take longer. nginx already buffers the body, so this is a safety net.
  server.requestTimeout = 10 * 60_000
  server.headersTimeout = 65_000
  server.keepAliveTimeout = 65_000
}

export default app
