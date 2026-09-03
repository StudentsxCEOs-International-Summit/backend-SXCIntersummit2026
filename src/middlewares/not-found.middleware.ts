import { Request, Response, NextFunction } from 'express'
import { notFound as notFoundResponse } from '../utils/response'

export function notFound(_req: Request, res: Response, _next: NextFunction) {
  return notFoundResponse(res, 'Route not found')
}
