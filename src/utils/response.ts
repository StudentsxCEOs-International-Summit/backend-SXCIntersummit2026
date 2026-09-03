import { Response } from 'express'

export type ApiSuccess<T> = {
  success: true
  message: string
  data: T
}

export type ApiError = {
  success: false
  message: string
  errors?: unknown
}

export function ok<T>(res: Response, data: T, message = 'success', status = 200) {
  const payload: ApiSuccess<T> = { success: true, message, data }
  return res.status(status).json(payload)
}

export function fail(
  res: Response,
  message = 'error',
  status = 500,
  errors?: unknown,
) {
  const payload: ApiError = { success: false, message, errors }
  return res.status(status).json(payload)
}

export function badRequest(res: Response, message = 'bad request', errors?: unknown) {
  return fail(res, message, 400, errors)
}

export function unauthorized(res: Response, message = 'unauthorized', errors?: unknown) {
  return fail(res, message, 401, errors)
}

export function forbidden(res: Response, message = 'forbidden', errors?: unknown) {
  return fail(res, message, 403, errors)
}

export function notFound(res: Response, message = 'not found', errors?: unknown) {
  return fail(res, message, 404, errors)
}

export function conflict(res: Response, message = 'conflict', errors?: unknown) {
  return fail(res, message, 409, errors)
}

export function internalError(
  res: Response,
  message = 'internal server error',
  errors?: unknown,
) {
  return fail(res, message, 500, errors)
}
