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

/** Shown to visitors when something breaks on our side; the technical cause stays in the server log. */
export const FRIENDLY_SERVER_ERROR =
  'Something went wrong on our side. Please refresh the page and try again. If it keeps happening, please contact our team.'

/** Shown when the database or network behind the API can't be reached for a moment. */
export const FRIENDLY_UNAVAILABLE =
  "We can't connect to our server right now. Please check your internet connection and refresh the page. If it keeps happening, please contact our team."

/** Shown when a session token is rejected by the JWT library. */
export const FRIENDLY_SESSION_EXPIRED = 'Your session has expired. Please sign in again.'

const CONNECTION_MESSAGE =
  /can't reach database server|connection terminated|connection timeout|timeout exceeded when trying to connect|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|getaddrinfo/i

const SESSION_MESSAGE = /\bjwt\b|invalid signature|TokenExpiredError|JsonWebTokenError|NotBeforeError/i

/**
 * Raw library, runtime, SQL, mail and file-path text that must never reach a visitor's screen.
 * Messages written for people ("Email is already registered") never match.
 */
const TECHNICAL_MESSAGE =
  /prisma|invocation|ERR_[A-Z_]+|Unique constraint|Foreign key|ECONN|ETIMEDOUT|\bselect\b.+\bfrom\b|\binsert into\b|relation ".+" does not exist|column .+ does not exist|Cannot read propert|is not a function|is not defined|Unexpected token|\b(Type|Reference|Syntax)Error\b|Failed to send email|SMTP|EAUTH|ESOCKET|Invalid login|gaxios|invalid_grant|googleapis|node_modules|not configured|is not set|Google Drive|Drive account|folder ID|Local copy|no account is available|[A-Za-z]:\x5c|\.(ts|js):\d+|\n\s+at /i

// Bare "something failed" texts carry no help for a visitor, so they get the friendly message too.
const GENERIC_SERVER_MESSAGE = /^(internal server error|database operation failed)$/i

export const isConnectionMessage = (message: string) => CONNECTION_MESSAGE.test(message)

/**
 * Every error response goes through here, so one rule protects all of them: a message that is really a
 * leaked technical error is swapped for a friendly one (503 when the cause was a connection problem,
 * 401 for a rejected token) and the original is only written to the server log. Messages written for
 * visitors pass through unchanged.
 */
export function fail(
  res: Response,
  message = 'error',
  status = 500,
  errors?: unknown,
) {
  let finalMessage = message
  let finalStatus = status
  let finalErrors = errors
  let sanitized = false

  if (SESSION_MESSAGE.test(message)) {
    finalMessage = FRIENDLY_SESSION_EXPIRED
    finalStatus = 401
    sanitized = true
  } else if (CONNECTION_MESSAGE.test(message)) {
    console.error('[Connection Error]', message)
    finalMessage = FRIENDLY_UNAVAILABLE
    finalStatus = 503
    sanitized = true
  } else if (TECHNICAL_MESSAGE.test(message) || GENERIC_SERVER_MESSAGE.test(message)) {
    console.error('[Server Error]', message)
    finalMessage = FRIENDLY_SERVER_ERROR
    finalStatus = 500
    sanitized = true
  }

  // Technical detail is only echoed while developing; production never sends it.
  // The one thing that stays in production is the request id, so the team can find the log line.
  if (process.env.NODE_ENV === 'production' && (sanitized || finalStatus >= 500)) {
    const reqId = (finalErrors as { reqId?: unknown } | null | undefined)?.reqId
    finalErrors = typeof reqId === 'string' ? { reqId } : undefined
  }

  const payload: ApiError = { success: false, message: finalMessage, errors: finalErrors }
  return res.status(finalStatus).json(payload)
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
