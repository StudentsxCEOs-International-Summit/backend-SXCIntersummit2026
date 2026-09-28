import { Request, Response, NextFunction } from 'express'
import { unauthorized, forbidden } from '../utils/response'
import { verifyToken } from '../utils/jwt'
import { isTokenBlacklisted } from '../features/auth/auth.service'

export interface AuthRequest extends Request {
  user?: any
  token?: string
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1]

  if (!token) {
    return unauthorized(res, 'Unauthorized, no token provided')
  }

  try {
    const blacklisted = await isTokenBlacklisted(token)
    if (blacklisted) {
      return unauthorized(res, 'Token has been revoked')
    }

    const decoded = verifyToken(token)
    req.user = decoded
    req.token = token
    next()
  } catch {
    return unauthorized(res, 'Invalid or expired token')
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.accountType !== 'staff') {
    return forbidden(res, 'Forbidden: Admin access required')
  }
  next()
}

