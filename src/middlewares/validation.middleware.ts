import { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { fail } from '../utils/response'
import { cleanupUploadFiles } from './clean-up-files.middleware'
import { formatZodError } from '../utils/validation'
import { createChildLogger } from '../configs/logger'

const validationLogger = createChildLogger('VALIDATION')

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

    const issues: z.ZodIssue[] = []

    if (result.body && !result.body.success) issues.push(...result.body.error.issues)
    if (result.query && !result.query.success) issues.push(...result.query.error.issues)
    if (result.params && !result.params.success) issues.push(...result.params.error.issues)

    if (issues.length > 0) {
      cleanupUploadFiles(new Error('Validation Error'), req, res, () => {})
      const message = formatZodError(issues)
      const reqId = (req as any).id || (req.headers['x-request-id'] as string) || 'unknown'
      validationLogger.warn({ reqId, path: req.path, method: req.method, issues, msg: message }, 'Request input validation failed')
      return fail(res, message, 400, issues)
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
