import crypto from 'crypto'
import prisma from '../../configs/db'
import { env } from '../../configs/env'
import { hashPassword, comparePassword } from '../../utils/bcrypt'
import { signToken, decodeToken } from '../../utils/jwt'
import { sendOtpEmail } from '../../services/mail.service'
import { GoogleUserInfo } from '../../services/google-auth.service'
import { RegisterInput, OtpInput } from './auth.schema'

const OTP_EXPIRY_MS = 5 * 60 * 1000

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({ where: { email } })
}

export async function findStaffByEmail(email: string) {
  return await prisma.staff.findUnique({
    where: { email },
    include: { divisions: true },
  })
}

export async function registerUser(input: RegisterInput) {
  const { name, email, password } = input

  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    throw new Error('Email is already registered as user')
  }

  const existingStaff = await findStaffByEmail(email)
  if (existingStaff) {
    throw new Error('Email is already registered as staff')
  }

  const hashedPassword = await hashPassword(password)
  const otp = generateOTP()

  await prisma.pendingUserVerification.upsert({
    where: { email },
    update: {
      name,
      password: hashedPassword,
      otp,
      otpSentAt: new Date(),
      otpTries: 0,
      purpose: 'register',
    },
    create: {
      name,
      email,
      password: hashedPassword,
      otp,
      otpSentAt: new Date(),
      otpTries: 0,
      purpose: 'register',
    },
  })

  await sendOtpEmail(email, otp, 'register')

  return { email, name }
}

export async function verifyOtp(input: OtpInput) {
  const { email, otp } = input

  const pending = await prisma.pendingUserVerification.findUnique({
    where: { email },
  })

  if (!pending) {
    throw new Error('Verification data for this email was not found or has expired')
  }

  const otpAge = Date.now() - new Date(pending.otpSentAt).getTime()
  if (otpAge > OTP_EXPIRY_MS) {
    throw new Error('OTP has expired. Please request a new one')
  }

  if (pending.otp !== otp) {
    const currentTries = pending.otpTries + 1

    if (currentTries >= 3) {
      await prisma.pendingUserVerification.delete({ where: { email } })
      throw new Error('Invalid OTP entered 3 times. Verification data deleted. Please register again.')
    }

    await prisma.pendingUserVerification.update({
      where: { email },
      data: { otpTries: currentTries },
    })

    throw new Error(`Invalid OTP. Attempts left: ${3 - currentTries}`)
  }

  if (pending.purpose === 'register') {
    const [newUser] = await prisma.$transaction([
      prisma.user.create({
        data: {
          name: pending.name || 'User',
          email: pending.email,
          password: pending.password || '',
          status: 1,
          role: 'USER',
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      }),
      prisma.pendingUserVerification.delete({
        where: { email },
      }),
    ])

    const token = signToken(
      {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        accountType: 'user',
      },
      { expiresIn: env.JWT_EXPIRE as any },
    )

    return {
      purpose: 'register' as const,
      user: newUser,
      token,
    }
  }

  if (pending.purpose === 'forgot_password') {
    await prisma.pendingUserVerification.delete({ where: { email } })

    const resetToken = signToken(
      { email, purpose: 'reset_password' },
      { expiresIn: '10m' },
    )

    return {
      purpose: 'forgot_password' as const,
      email,
      resetToken,
    }
  }

  throw new Error('Invalid OTP verification purpose')
}

export async function resendOtp(email: string) {
  const pending = await prisma.pendingUserVerification.findUnique({
    where: { email },
  })

  if (!pending) {
    throw new Error('No active verification process for this email')
  }

  const newOtp = generateOTP()

  await prisma.pendingUserVerification.update({
    where: { email },
    data: {
      otp: newOtp,
      otpSentAt: new Date(),
      otpTries: 0,
    },
  })

  await sendOtpEmail(email, newOtp, pending.purpose as 'register' | 'forgot_password')

  return { email }
}

export async function forgotPassword(email: string) {
  const user = await findUserByEmail(email)
  if (!user) {
    throw new Error('Email not found')
  }

  const otp = generateOTP()

  await prisma.pendingUserVerification.upsert({
    where: { email },
    update: {
      otp,
      otpSentAt: new Date(),
      otpTries: 0,
      purpose: 'forgot_password',
    },
    create: {
      email,
      otp,
      otpSentAt: new Date(),
      otpTries: 0,
      purpose: 'forgot_password',
    },
  })

  await sendOtpEmail(email, otp, 'forgot_password')

  return { email }
}

export async function resetPassword(email: string, newPassword: string) {
  const user = await findUserByEmail(email)
  if (!user) {
    throw new Error('User not found')
  }

  const hashedPassword = await hashPassword(newPassword)

  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  })

  return { email }
}

export async function loginUser(email: string, password: string) {
  const user = await findUserByEmail(email)
  if (!user) {
    throw new Error('Email is not registered as user')
  }

  const isValid = await comparePassword(password, user.password)
  if (!isValid) {
    throw new Error('Invalid credentials')
  }

  const token = signToken(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accountType: 'user',
    },
    { expiresIn: env.JWT_EXPIRE as any },
  )

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  }
}

export async function loginAdmin(email: string, password: string) {
  const staff = await findStaffByEmail(email)
  if (!staff) {
    throw new Error('Email is not registered as staff')
  }

  const isValid = await comparePassword(password, staff.password)
  if (!isValid) {
    throw new Error('Invalid credentials')
  }

  const token = signToken(
    {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      divisionId: staff.divisionId,
      divisionName: staff.divisions?.name,
      accountType: 'staff',
    },
    { expiresIn: env.JWT_EXPIRE as any },
  )

  return {
    staff: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      division: staff.divisions?.name,
    },
    token,
  }
}

export async function blacklistToken(token: string): Promise<void> {
  let expiresAt: Date
  try {
    const decoded = decodeToken<{ exp?: number }>(token)
    if (decoded?.exp) {
      expiresAt = new Date(decoded.exp * 1000)
    } else {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  } catch {
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  }

  await prisma.blacklist.upsert({
    where: { token },
    update: {},
    create: {
      token,
      expiresAt,
    },
  })
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const record = await prisma.blacklist.findUnique({
    where: { token },
  })

  return Boolean(record)
}

export async function authenticateWithGoogle(googleUser: GoogleUserInfo) {
  const { id: googleId, email, name } = googleUser

  let user = await prisma.user.findUnique({
    where: { googleId },
  })

  if (!user) {
    user = await prisma.user.findUnique({
      where: { email },
    })

    if (user) {
      user = await prisma.user.update({
        where: { email },
        data: { googleId },
      })
    } else {
      const randomPassword = crypto.randomUUID()
      const hashedPassword = await hashPassword(randomPassword)

      user = await prisma.user.create({
        data: {
          googleId,
          email,
          name: name || 'Google User',
          password: hashedPassword,
          status: 1,
          role: 'USER',
        },
      })
    }
  }

  // Clear any existing pending verification for this email
  await prisma.pendingUserVerification.deleteMany({
    where: { email },
  })

  const token = signToken(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accountType: 'user',
    },
    { expiresIn: env.JWT_EXPIRE as any },
  )

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  }
}

