import { Request, Response } from 'express'
import { ok, badRequest, unauthorized, internalError } from '../../utils/response'
import { verifyToken } from '../../utils/jwt'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { authCookieOptions, clearCookieOptions } from '../../configs/cookie'
import * as authService from './auth.service'
import {
  getGoogleAuthUrl,
  getGoogleUserFromCode,
} from '../../services/google-auth.service'
import {
  RegisterInput,
  LoginInput,
  OtpInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './auth.schema'

export async function register(req: Request, res: Response) {
  try {
    const input: RegisterInput = req.body
    const result = await authService.registerUser(input)

    return ok(
      res,
      { email: result.email },
      'Registration initiated. Verification OTP has been sent to your email.',
      201,
    )
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function verifyOtp(req: Request, res: Response) {
  try {
    const input: OtpInput = req.body
    const result = await authService.verifyOtp(input)

    if (result.purpose === 'register') {
      res.cookie('token', result.token, authCookieOptions)

      return ok(
        res,
        {
          user: result.user,
          token: result.token,
        },
        'Verification successful. Account is now active.',
      )
    }

    if (result.purpose === 'forgot_password') {
      return ok(
        res,
        { resetToken: result.resetToken },
        'OTP verified successfully. Please enter your new password using the reset token.',
      )
    }
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function resendOtp(req: Request, res: Response) {
  try {
    const { email } = req.body
    await authService.resendOtp(email)

    return ok(res, null, 'A new OTP has been sent to your email.')
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const input: ForgotPasswordInput = req.body
    await authService.forgotPassword(input.email)

    return ok(res, null, 'Password reset OTP has been sent to your email.')
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const input: ResetPasswordInput = req.body

    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : (req.body.resetToken as string | undefined)

    if (!token) {
      return unauthorized(res, 'Reset token not found. Please verify OTP first.')
    }

    let decoded: any
    try {
      decoded = verifyToken(token)
    } catch {
      return unauthorized(res, 'Reset token is invalid or has expired.')
    }

    if (decoded.purpose !== 'reset_password' || !decoded.email) {
      return unauthorized(res, 'Invalid token purpose for password reset.')
    }

    await authService.resetPassword(decoded.email, input.password)

    return ok(res, null, 'Password updated successfully. Please login with your new password.')
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function loginUser(req: Request, res: Response) {
  try {
    const input: LoginInput = req.body
    const result = await authService.loginUser(input.email, input.password)

    res.cookie('token', result.token, authCookieOptions)

    return ok(
      res,
      {
        user: result.user,
        token: result.token,
      },
      'User login successful.',
    )
  } catch (error: any) {
    return unauthorized(res, error.message)
  }
}

export async function loginAdmin(req: Request, res: Response) {
  try {
    const input: LoginInput = req.body
    const result = await authService.loginAdmin(input.email, input.password)

    res.cookie('token', result.token, authCookieOptions)

    return ok(
      res,
      {
        staff: result.staff,
        token: result.token,
      },
      'Staff login successful.',
    )
  } catch (error: any) {
    return unauthorized(res, error.message)
  }
}

export async function logout(req: AuthRequest, res: Response) {
  try {
    const token = req.token || req.cookies?.token || req.headers.authorization?.split(' ')[1]
    if (token) {
      await authService.blacklistToken(token)
    }

    res.clearCookie('token', clearCookieOptions)

    return ok(res, null, 'Logout successful. Session cleared.')
  } catch (error: any) {
    return internalError(res, error.message)
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  return ok(res, { user: req.user }, 'Current user profile data.')
}

export async function googleAuthRedirect(req: Request, res: Response) {
  try {
    const state = req.query.state as string | undefined
    const url = getGoogleAuthUrl(state)

    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return ok(res, { url }, 'Google OAuth authorization URL generated.')
    }

    return res.redirect(url)
  } catch (error: any) {
    return badRequest(res, error.message)
  }
}

export async function googleAuthCallback(req: Request, res: Response) {
  try {
    const code = req.query.code as string | undefined
    const state = req.query.state as string | undefined

    if (!code) {
      return badRequest(res, 'Authorization code is missing from Google callback.')
    }

    const googleUser = await getGoogleUserFromCode(code)
    const result = await authService.authenticateWithGoogle(googleUser)

    res.cookie('token', result.token, authCookieOptions)

    if (state && typeof state === 'string' && state.startsWith('http')) {
      const redirectUrl = new URL(state)
      redirectUrl.searchParams.set('token', result.token)
      return res.redirect(redirectUrl.toString())
    }

    return ok(
      res,
      {
        user: result.user,
        token: result.token,
      },
      'Google authentication successful.',
    )
  } catch (error: any) {
    return unauthorized(res, error.message)
  }
}

