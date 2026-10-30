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

/** Technical detail is only echoed outside production, to help while developing. */
const debugDetails = (err: unknown) => (env.NODE_ENV === 'production' ? undefined : err instanceof Error ? err.message : err)

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
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return badRequest(res, 'Validation error', err.issues)
  }

  if (isConnectionError(err)) {
    console.error('[Connection Error]', err instanceof Error ? err.message : err)
    return fail(res, FRIENDLY_UNAVAILABLE, 503, debugDetails(err))
  }

  if (err instanceof AppError) {
    const details = (env.NODE_ENV === 'production' && err.statusCode >= 500) ? undefined : err.details
    return fail(res, err.message, err.statusCode, details)
  }

  if (err instanceof MulterError) {
    console.error('[Upload Error]', err.code, err.message)
    return badRequest(res, uploadMessage(err), debugDetails(err))
  }

  // Malformed or oversized request bodies are rejected by the body parser before any route runs.
  const httpStatus = (err as { status?: unknown } | null)?.status
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    console.error('[Request Error]', httpStatus, err instanceof Error ? err.message : err)
    return fail(
      res,
      httpStatus === 413
        ? 'The data you sent is too large. Please reduce it and try again.'
        : 'We could not read your request. Please refresh the page and try again.',
      httpStatus,
      debugDetails(err),
    )
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error('[Prisma Error]', err.code, JSON.stringify(err.meta))
    if (err.code === 'P2002') {
      return conflict(res, 'A record with that value already exists')
    }
    if (err.code === 'P2025') {
      return notFound(res, 'Record not found')
    }
    if (err.code === 'P2003') {
      return badRequest(res, 'Invalid reference: related record not found')
    }
    return fail(res, FRIENDLY_SERVER_ERROR, 500, env.NODE_ENV === 'production' ? undefined : { code: err.code, meta: err.meta })
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[Prisma Validation]', err.message)
    return fail(res, FRIENDLY_SERVER_ERROR, 500, debugDetails(err))
  }

  if (err instanceof Error) {
    console.error('[Unhandled]', err.stack)
    return fail(res, FRIENDLY_SERVER_ERROR, 500, debugDetails(err))
  }

  console.error('[Unhandled error]', err)
  return fail(res, FRIENDLY_SERVER_ERROR, 500)
}
