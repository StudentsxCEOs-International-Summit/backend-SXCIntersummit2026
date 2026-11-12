import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { MulterError } from 'multer'
import { Prisma } from '../../generated/prisma/client'
import {
  badRequest,
  conflict,
  fail,
  notFound,
  FRIENDLY_SERVER_ERROR,
  FRIENDLY_UNAVAILABLE,
  isConnectionMessage,
} from '../utils/response'
import { env } from '../configs/env'
import { logger } from '../configs/logger'

// Prisma codes for "database unreachable / timed out / connection dropped / pool exhausted".
const DB_CONNECTION_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'])

function isConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true
  if (err instanceof Prisma.PrismaClientKnownRequestError && DB_CONNECTION_CODES.has(err.code)) return true
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true
    return isConnectionMessage(err.message)
  }
  return false
}

/** Plain-language text for each upload failure; multer's own wording is technical. */
function uploadMessage(err: MulterError): string {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return 'One of your files is too large. Please compress it or upload a smaller file and try again.'
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'You attached more files than allowed. Please check your files and try again.'
  }
  return 'We could not process your upload. Please check your files and try again.'
}

/**
 * What goes into a response's `errors` for a server-side failure: the request id so the team can find
 * the log line, plus the technical detail only outside production (`fail` drops it there anyway).
 */
const serverErrorInfo = (reqId: string, err?: unknown) => ({
  reqId,
  ...(env.NODE_ENV !== 'production' && err !== undefined
    ? { detail: err instanceof Error ? err.message : err }
    : {}),
})

export class AppError extends Error {
  statusCode: number
  details?: unknown

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const reqId = (req as any).id || (req.headers['x-request-id'] as string) || 'unknown'

  if (err instanceof ZodError) {
    logger.warn({ context: 'VALIDATION', reqId, issues: err.issues, msg: 'Request input validation failed' })
    return badRequest(res, 'Validation error', err.issues)
  }

  if (isConnectionError(err)) {
    logger.error({ context: 'CONNECTION', reqId, err, msg: 'Database or network connection problem' })
    return fail(res, FRIENDLY_UNAVAILABLE, 503, serverErrorInfo(reqId, err))
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ context: 'APP_ERROR', reqId, err, msg: err.message })
      return fail(res, FRIENDLY_SERVER_ERROR, err.statusCode, serverErrorInfo(reqId, err))
    }
    logger.warn({ context: 'APP_ERROR', reqId, statusCode: err.statusCode, msg: err.message })
    return fail(res, err.message, err.statusCode, err.details)
  }

  if (err instanceof MulterError) {
    logger.warn({ context: 'UPLOAD', reqId, err, msg: err.message })
    return badRequest(res, uploadMessage(err))
  }

  // Malformed or oversized request bodies are rejected by the body parser before any route runs.
  const httpStatus = (err as { status?: unknown } | null)?.status
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    logger.warn({ context: 'REQUEST', reqId, err, statusCode: httpStatus, msg: 'Request could not be read' })
    return fail(
      res,
      httpStatus === 413
        ? 'The data you sent is too large. Please reduce it and try again.'
        : 'We could not read your request. Please refresh the page and try again.',
      httpStatus,
    )
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error({
      context: 'DB',
      reqId,
      code: err.code,
      meta: err.meta,
      err,
      msg: 'Prisma database request error',
    })

    if (err.code === 'P2002') {
      return conflict(res, 'A record with that value already exists')
    }
    if (err.code === 'P2025') {
      return notFound(res, 'Requested record not found')
    }
    if (err.code === 'P2003') {
      return badRequest(res, 'Invalid reference: related record not found')
    }

    // Zero internal database leaks in production (OWASP CWE-209)
    return fail(res, FRIENDLY_SERVER_ERROR, 500, serverErrorInfo(reqId, { code: err.code, meta: err.meta }))
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ context: 'DB', reqId, err, msg: 'Prisma schema validation error' })
    return fail(res, FRIENDLY_SERVER_ERROR, 500, serverErrorInfo(reqId, err))
  }

  if (err instanceof Error) {
    logger.error({ context: 'UNHANDLED', reqId, err, stack: err.stack, msg: err.message })
    return fail(res, FRIENDLY_SERVER_ERROR, 500, serverErrorInfo(reqId, err))
  }

  logger.error({ context: 'UNHANDLED', reqId, err, msg: 'Unknown exception' })
  return fail(res, FRIENDLY_SERVER_ERROR, 500, serverErrorInfo(reqId))
}
