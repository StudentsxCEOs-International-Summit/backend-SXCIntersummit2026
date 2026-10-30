import { Router } from 'express'
import { validateRequest } from '../../middlewares/validation.middleware'
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware'
import { authRateLimiter } from '../../middlewares/rate-limiter.middleware'
import * as AuthController from './auth.controller'
import {
  registerSchema,
  loginSchema,
  otpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleCallbackQuerySchema,
} from './auth.schema'

const authRouter = Router()

authRouter.use(
  ['/register', '/verify-otp', '/resend-otp', '/forgot-password', '/reset-password', '/login', '/admin/login'],
  authRateLimiter,
)

authRouter.post(
  '/register',
  validateRequest({ body: registerSchema }),
  AuthController.register,
)

authRouter.post(
  '/verify-otp',
  validateRequest({ body: otpSchema }),
  AuthController.verifyOtp,
)

authRouter.post(
  '/resend-otp',
  validateRequest({ body: resendOtpSchema }),
  AuthController.resendOtp,
)

authRouter.post(
  '/forgot-password',
  validateRequest({ body: forgotPasswordSchema }),
  AuthController.forgotPassword,
)

authRouter.post(
  '/reset-password',
  validateRequest({ body: resetPasswordSchema }),
  AuthController.resetPassword,
)

authRouter.post(
  '/login',
  validateRequest({ body: loginSchema }),
  AuthController.loginUser,
)

authRouter.post(
  '/admin/login',
  validateRequest({ body: loginSchema }),
  AuthController.loginAdmin,
)

authRouter.post('/logout', requireAuth, AuthController.logout)

authRouter.get('/me', requireAuth, AuthController.getMe)

// Google OAuth Endpoints
authRouter.get('/google', AuthController.googleAuthRedirect)
authRouter.get('/google/gdrive-setup', requireAuth, requireAdmin, AuthController.googleDriveSetupRedirect)

authRouter.get(
  '/google/callback',
  validateRequest({ query: googleCallbackQuerySchema }),
  AuthController.googleAuthCallback,
)

export default authRouter

