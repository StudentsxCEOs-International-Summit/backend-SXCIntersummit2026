import { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { fail } from '../utils/response'
import { cleanupUploadFiles } from './clean-up-files.middleware'

type SchemaMap = {
  body?: z.ZodType
  query?: z.ZodType
  params?: z.ZodType
}

export function validateRequest(schema: SchemaMap) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = {
      body: schema.body?.safeParse(req.body),
      query: schema.query?.safeParse(req.query),
      params: schema.params?.safeParse(req.params),
    }

    const errors: unknown[] = []

    if (result.body && !result.body.success) errors.push(result.body.error.issues)
    if (result.query && !result.query.success) errors.push(result.query.error.issues)
    if (result.params && !result.params.success) errors.push(result.params.error.issues)

    if (errors.length > 0) {
      cleanupUploadFiles(new Error('Validation Error'), req, res, () => {})
      return fail(res, 'Validation error', 400, errors.flat())
    }

    if (result.body?.success) req.body = result.body.data
    if (result.query?.success) {
      Object.defineProperty(req, 'query', {
        value: result.query.data,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
    if (result.params?.success) {
      Object.defineProperty(req, 'params', {
        value: result.params.data,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }

    return next()
  }
}
