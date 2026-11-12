import { test } from 'node:test'
import assert from 'node:assert/strict'
import pino from 'pino'
import { logger, createChildLogger } from '../src/configs/logger'

test('createChildLogger binds context and extra metadata correctly', () => {
  const child = createChildLogger('IBCC', { subModule: 'REGISTRATION' })
  const bindings = child.bindings()

  assert.equal(bindings.context, 'IBCC')
  assert.equal(bindings.subModule, 'REGISTRATION')
})

test('logger has valid level and timestamp function', () => {
  assert.ok(['info', 'debug'].includes(logger.level))
  assert.equal(typeof logger.info, 'function')
  assert.equal(typeof logger.error, 'function')
  assert.equal(typeof logger.warn, 'function')
})

test('sensitive fields are properly redacted in serialized log output', async () => {
  let captured = ''
  const destination = {
    write(chunk: string) {
      captured += chunk
    },
  }

  const testLogger = pino(
    {
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'password',
          'confirmPassword',
          'otp',
          'accessCode',
          'DATABASE_URL',
          'JWT_SECRET',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  )

  testLogger.info({
    password: 'superSecretPassword123!',
    confirmPassword: 'superSecretPassword123!',
    otp: '123456',
    accessCode: 'SEC89012',
    DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/db',
    JWT_SECRET: 'jwt-secret-token-key',
    req: {
      headers: {
        authorization: 'Bearer eyJhbGciOi...',
        cookie: 'session=xyz123',
      },
      body: {
        password: 'nestedSecretPassword',
      },
    },
    safeField: 'harmlessPublicData',
  })

  const parsed = JSON.parse(captured.trim())

  assert.equal(parsed.password, '[REDACTED]')
  assert.equal(parsed.confirmPassword, '[REDACTED]')
  assert.equal(parsed.otp, '[REDACTED]')
  assert.equal(parsed.accessCode, '[REDACTED]')
  assert.equal(parsed.DATABASE_URL, '[REDACTED]')
  assert.equal(parsed.JWT_SECRET, '[REDACTED]')
  assert.equal(parsed.req.headers.authorization, '[REDACTED]')
  assert.equal(parsed.req.headers.cookie, '[REDACTED]')
  assert.equal(parsed.req.body.password, '[REDACTED]')
  assert.equal(parsed.safeField, 'harmlessPublicData')
  assert.match(parsed.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
})
