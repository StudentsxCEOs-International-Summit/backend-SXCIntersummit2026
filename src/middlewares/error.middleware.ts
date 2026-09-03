import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { MulterError } from 'multer'
import { Prisma } from '../../generated/prisma/client'
import { badRequest, conflict, fail, internalError, notFound } from '../utils/response'
import { env } from '../configs/env'

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

  if (err instanceof AppError) {
    const details = (env.NODE_ENV === 'production' && err.statusCode >= 500) ? undefined : err.details
    return fail(res, err.message, err.statusCode, details)
  }

  if (err instanceof MulterError) {
    const details = env.NODE_ENV === 'production' ? undefined : err
    return badRequest(res, `File upload error: ${err.message}`, details)
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
    if (env.NODE_ENV !== 'production') {
      return fail(res, `Database error: ${err.code}`, 500, err.meta)
    }
    return internalError(res, 'Database error')
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[Prisma Validation]', err.message)
    return badRequest(res, `Invalid data: ${err.message.split('\\n').slice(-2).join(' ').trim()}`)
  }

  if (err instanceof Error) {
    console.error('[Unhandled]', err.stack)
    return internalError(res, err.message)
  }

  console.error('[Unhandled error]', err)
  return internalError(res, 'Internal server error')
}
