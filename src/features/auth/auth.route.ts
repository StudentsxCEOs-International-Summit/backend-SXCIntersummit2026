import { Router } from 'express'
import { validateRequest } from '../../middlewares/validation.middleware'
import { requireAuth } from '../../middlewares/auth.middleware'
import * as AuthController from './auth.controller'
import {
  registerSchema,
  loginSchema,
  otpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schema'

const authRouter = Router()

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

export default authRouter

