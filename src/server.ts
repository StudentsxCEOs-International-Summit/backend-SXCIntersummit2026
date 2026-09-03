import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './configs/env'
import { errorHandler } from './middlewares/error.middleware'
import { notFound } from './middlewares/not-found.middleware'
import { apiRateLimiter } from './middlewares/rate-limiter.middleware'

const app = express()

app.set('trust proxy', true)

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
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
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.use('/api', apiRateLimiter)

app.get('/', (_req, res) => {
  res.json({ message: 'API SXC Intersummit 2026 is running' })
})

// Route is not ready yet
// app.use('/api', routes)

// Fallback
app.use(notFound)
app.use(errorHandler)

if (env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    console.log(`API running at ${env.APP_URL}`)
    console.log(`NODE_ENV : ${env.NODE_ENV}`)
    console.log(`APP_ENV  : ${env.APP_ENV}`)
  })
}

export default app
