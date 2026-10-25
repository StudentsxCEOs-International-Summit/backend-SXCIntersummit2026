import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import swaggerUi from 'swagger-ui-express'
import { env } from './configs/env'
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
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

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

  app.listen(env.PORT, () => {
    console.log(`API running at ${env.APP_URL}`)
    if (env.NODE_ENV !== 'production') {
      console.log(`Swagger Docs available at ${env.APP_URL}/api-docs`)
    }
    console.log(`NODE_ENV : ${env.NODE_ENV}`)
    console.log(`APP_ENV  : ${env.APP_ENV}`)
  })
}

export default app
