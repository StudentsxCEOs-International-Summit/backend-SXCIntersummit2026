import { Request, Response } from 'express'
import { createChildLogger } from '../../configs/logger'

const authLogger = createChildLogger('AUTH')
import { ok, badRequest, unauthorized, internalError } from '../../utils/response'
import { verifyToken } from '../../utils/jwt'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { authCookieOptions, clearCookieOptions } from '../../configs/cookie'
import * as authService from './auth.service'
import {
  getGoogleAuthUrl,
  getGoogleUserFromCode,
  googleOAuthClient,
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
    authLogger.info({ email: result.email, msg: 'Registration initiated' })

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
    authLogger.info({ email: input.email, purpose: result.purpose, msg: 'OTP verified successfully' })

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
    authLogger.info({ userId: result.user.id, email: result.user.email, role: result.user.role, msg: 'User login successful' })

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
    authLogger.info({ staffId: result.staff.id, email: result.staff.email, role: result.staff.role, msg: 'Staff login successful' })

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

export function googleDriveSetupRedirect(_req: Request, res: Response) {
  const url = googleOAuthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/drive',
    ],
    state: 'gdrive_setup',
  })
  return res.redirect(url)
}

export async function googleAuthCallback(req: Request, res: Response) {
  try {
    const code = req.query.code as string | undefined
    const state = req.query.state as string | undefined

    if (!code) {
      return badRequest(res, 'Authorization code is missing from Google callback.')
    }

    if (state === 'gdrive_setup') {
      const { tokens } = await googleOAuthClient.getToken(code)
      if (!tokens.refresh_token) {
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head><title>Google Drive Setup</title><meta charset="utf-8"></head>
            <body style="font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; max-width: 650px; margin: 40px auto; border-radius: 12px; border: 1px solid #334155;">
              <h2 style="color: #ef4444; margin-top: 0;">⚠️ Refresh Token Tidak Diberikan oleh Google</h2>
              <p>Google mendeteksi akun ini sebelumnya sudah pernah memberikan izin.</p>
              <p><b>Solusi (10 detik):</b></p>
              <ol style="line-height: 1.8;">
                <li>Buka <a href="https://myaccount.google.com/connections" target="_blank" style="color: #38bdf8;">Google Account Connections (myaccount.google.com/connections)</a>.</li>
                <li>Cari aplikasi <b>Student x CEO Intersummit</b> dan klik <b>Hapus Akses / Delete Connection</b>.</li>
                <li>Buka kembali tautan <a href="/api/auth/google/gdrive-setup" style="color: #38bdf8;">/api/auth/google/gdrive-setup</a> dan klik Izinkan.</li>
              </ol>
            </body>
          </html>
        `)
      }

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Setup</title><meta charset="utf-8"></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; max-width: 650px; margin: 40px auto; border-radius: 12px; border: 1px solid #334155;">
            <h2 style="color: #10b981; margin-top: 0;">✅ Google Drive Refresh Token Berhasil Dibuat!</h2>
            <p>Silakan salin baris di bawah ini dan tempelkan ke file <code>.env</code> kamu:</p>
            <textarea style="width: 100%; height: 90px; font-size: 14px; font-family: monospace; padding: 12px; background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 8px; box-sizing: border-box;" readonly>GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}</textarea>
            <p style="color: #94a3b8; font-size: 14px; margin-top: 16px;">
              Akun <b>itsxcintersummit@gmail.com</b> sekarang aktif untuk storage, kuota 15 GB siap digunakan, dan error kuota 0 MB Service Account tidak akan muncul lagi!
            </p>
          </body>
        </html>
      `)
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

