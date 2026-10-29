import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { MulterError } from 'multer'
import { Prisma } from '../../generated/prisma/client'
import { badRequest, conflict, fail, internalError, notFound } from '../utils/response'
import { logger } from '../configs/logger'

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

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ context: 'APP_ERROR', reqId, err, msg: err.message })
      return fail(res, 'Internal server error', err.statusCode, { reqId })
    }
    logger.warn({ context: 'APP_ERROR', reqId, statusCode: err.statusCode, msg: err.message })
    return fail(res, err.message, err.statusCode, err.details)
  }

  if (err instanceof MulterError) {
    logger.warn({ context: 'UPLOAD', reqId, err, msg: err.message })
    return badRequest(res, `File upload error: ${err.message}`)
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
    return internalError(res, 'Database operation failed', { reqId })
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ context: 'DB', reqId, err, msg: 'Prisma schema validation error' })
    return badRequest(res, 'Invalid request data structure')
  }

  if (err instanceof Error) {
    logger.error({ context: 'UNHANDLED', reqId, err, stack: err.stack, msg: err.message })
    return internalError(res, 'Internal server error', { reqId })
  }

  logger.error({ context: 'UNHANDLED', reqId, err, msg: 'Unknown exception' })
  return internalError(res, 'Internal server error', { reqId })
}
