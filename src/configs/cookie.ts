import { CookieOptions } from 'express'
import { env } from './env'

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  maxAge: 24 * 3600 * 1000,
  path: '/',
  sameSite: 'lax',
}

export const clearCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  path: '/',
  sameSite: 'lax',
}
