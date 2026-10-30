import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Please enter a valid email address'))

export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required'),
  email: emailSchema,
  password: strongPasswordSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const otpSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().length(6, 'OTP must be exactly 6 digits').regex(/^[0-9]+$/, 'OTP must contain only numbers'),
})

export const resendOtpSchema = z.object({
  email: emailSchema,
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  password: strongPasswordSchema,
})

export const googleCallbackQuerySchema = z
  .object({
    code: z.string().min(1, 'Authorization code is required'),
    state: z.string().optional(),
  })
  .loose()

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type OtpInput = z.infer<typeof otpSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>
