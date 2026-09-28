import jwt, { SignOptions } from 'jsonwebtoken'
import { env } from '../configs/env'

export type JwtPayload = string | object | Buffer

export function signToken(payload: JwtPayload, options: SignOptions = {}) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.sign(payload, env.JWT_SECRET, options)
}

export function verifyToken<T = jwt.JwtPayload>(token: string) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.verify(token, env.JWT_SECRET) as T
}

export function decodeToken<T = jwt.JwtPayload>(token: string) {
  return jwt.decode(token) as T | null
}

