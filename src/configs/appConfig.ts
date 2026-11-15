import prisma from './db'
import logger from './logger'
import { env } from './env'

export interface AppConfigType {
  REGISTRATION_DEADLINE: string
  /** @deprecated Kept for backward compatibility with frontend v1 */
  REGISTRATION_EXTENDED_DEADLINE: string
  /** @deprecated Kept for backward compatibility with frontend v1 */
  EXTENDED_REGISTRATION_ENABLED: boolean
  MAX_SLIDE_PAGES: number
  MAX_SLIDE_SIZE_MB: number
  DEADLINE_REMINDER_DAYS: number
  PAYMENT_REMINDER_DAYS: number
  updatedAt?: string
  updatedBy?: {
    id: number
    name: string
    email: string
  } | null
}

const fallbackConfig: AppConfigType = {
  REGISTRATION_DEADLINE: env.REGISTRATION_DEADLINE,
  REGISTRATION_EXTENDED_DEADLINE: env.REGISTRATION_EXTENDED_DEADLINE,
  EXTENDED_REGISTRATION_ENABLED: env.EXTENDED_REGISTRATION_ENABLED,
  MAX_SLIDE_PAGES: env.MAX_SLIDE_PAGES,
  MAX_SLIDE_SIZE_MB: env.MAX_SLIDE_SIZE_MB,
  DEADLINE_REMINDER_DAYS: env.DEADLINE_REMINDER_DAYS,
  PAYMENT_REMINDER_DAYS: env.PAYMENT_REMINDER_DAYS,
}

// Write-through in-memory cache to serve public config checks without consuming Supabase connections
let _cachedConfig: AppConfigType = { ...fallbackConfig }

function mapFromDb(record: any): AppConfigType {
  return {
    REGISTRATION_DEADLINE: record.registrationDeadline.toISOString(),
    REGISTRATION_EXTENDED_DEADLINE: record.registrationExtendedDeadline.toISOString(),
    EXTENDED_REGISTRATION_ENABLED: record.extendedRegistrationEnabled,
    MAX_SLIDE_PAGES: record.maxSlidePages,
    MAX_SLIDE_SIZE_MB: record.maxSlideSizeMB,
    DEADLINE_REMINDER_DAYS: record.deadlineReminderDays,
    PAYMENT_REMINDER_DAYS: record.paymentReminderDays,
    updatedAt: record.updatedAt ? record.updatedAt.toISOString() : undefined,
    updatedBy: record.updatedBy
      ? { id: record.updatedBy.id, name: record.updatedBy.name, email: record.updatedBy.email }
      : null,
  }
}

export async function initAppConfig(): Promise<AppConfigType> {
  try {
    let record = await prisma.appConfig.findUnique({
      where: { id: 1 },
      include: { updatedBy: { select: { id: true, name: true, email: true } } },
    })

    if (!record) {
      record = await prisma.appConfig.create({
        data: {
          id: 1,
          registrationDeadline: new Date(fallbackConfig.REGISTRATION_DEADLINE),
          registrationExtendedDeadline: new Date(fallbackConfig.REGISTRATION_EXTENDED_DEADLINE),
          extendedRegistrationEnabled: fallbackConfig.EXTENDED_REGISTRATION_ENABLED,
          maxSlidePages: fallbackConfig.MAX_SLIDE_PAGES,
          maxSlideSizeMB: fallbackConfig.MAX_SLIDE_SIZE_MB,
          deadlineReminderDays: fallbackConfig.DEADLINE_REMINDER_DAYS,
          paymentReminderDays: fallbackConfig.PAYMENT_REMINDER_DAYS,
        },
        include: { updatedBy: { select: { id: true, name: true, email: true } } },
      })
    }

    _cachedConfig = mapFromDb(record)
    logger.info({ context: 'APP_CONFIG', config: _cachedConfig }, 'AppConfig initialized from database')
    return _cachedConfig
  } catch (error: any) {
    logger.warn({ context: 'APP_CONFIG', err: error }, 'Failed to load AppConfig from database; using fallback values from env')
    return _cachedConfig
  }
}

export function getAppConfig(): AppConfigType {
  return _cachedConfig
}

export async function updateAppConfigInDb(
  updates: Partial<AppConfigType>,
  staffId?: number,
): Promise<AppConfigType> {
  const dataToUpdate: any = {}

  if (updates.REGISTRATION_DEADLINE) {
    dataToUpdate.registrationDeadline = new Date(updates.REGISTRATION_DEADLINE)
  }
  if (updates.REGISTRATION_EXTENDED_DEADLINE) {
    dataToUpdate.registrationExtendedDeadline = new Date(updates.REGISTRATION_EXTENDED_DEADLINE)
  }
  if (typeof updates.EXTENDED_REGISTRATION_ENABLED === 'boolean') {
    dataToUpdate.extendedRegistrationEnabled = updates.EXTENDED_REGISTRATION_ENABLED
  }
  if (typeof updates.MAX_SLIDE_PAGES === 'number') {
    dataToUpdate.maxSlidePages = updates.MAX_SLIDE_PAGES
  }
  if (typeof updates.MAX_SLIDE_SIZE_MB === 'number') {
    dataToUpdate.maxSlideSizeMB = updates.MAX_SLIDE_SIZE_MB
  }
  if (typeof updates.DEADLINE_REMINDER_DAYS === 'number') {
    dataToUpdate.deadlineReminderDays = updates.DEADLINE_REMINDER_DAYS
  }
  if (typeof updates.PAYMENT_REMINDER_DAYS === 'number') {
    dataToUpdate.paymentReminderDays = updates.PAYMENT_REMINDER_DAYS
  }
  if (staffId) {
    dataToUpdate.updatedById = staffId
  }

  const updatedRecord = await prisma.appConfig.update({
    where: { id: 1 },
    data: dataToUpdate,
    include: { updatedBy: { select: { id: true, name: true, email: true } } },
  })

  _cachedConfig = mapFromDb(updatedRecord)
  logger.info({ context: 'APP_CONFIG', updatedByStaffId: staffId, config: _cachedConfig }, 'AppConfig updated in database and cache refreshed')
  return _cachedConfig
}

export async function reloadAppConfigFromEnv(): Promise<AppConfigType> {
  const updatedRecord = await prisma.appConfig.update({
    where: { id: 1 },
    data: {
      registrationDeadline: new Date(fallbackConfig.REGISTRATION_DEADLINE),
      registrationExtendedDeadline: new Date(fallbackConfig.REGISTRATION_EXTENDED_DEADLINE),
      extendedRegistrationEnabled: fallbackConfig.EXTENDED_REGISTRATION_ENABLED,
      maxSlidePages: fallbackConfig.MAX_SLIDE_PAGES,
      maxSlideSizeMB: fallbackConfig.MAX_SLIDE_SIZE_MB,
      deadlineReminderDays: fallbackConfig.DEADLINE_REMINDER_DAYS,
      paymentReminderDays: fallbackConfig.PAYMENT_REMINDER_DAYS,
    },
    include: { updatedBy: { select: { id: true, name: true, email: true } } },
  })

  _cachedConfig = mapFromDb(updatedRecord)
  logger.info({ context: 'APP_CONFIG', config: _cachedConfig }, 'AppConfig reset to environment defaults')
  return _cachedConfig
}

export function updateAppConfig(updates: Partial<AppConfigType>): AppConfigType {
  _cachedConfig = {
    ..._cachedConfig,
    ...updates,
  }
  return _cachedConfig
}

export function reloadAppConfig(): AppConfigType {
  _cachedConfig = { ...fallbackConfig }
  return _cachedConfig
}

export function getEffectiveDeadline(): Date {
  const cfg = getAppConfig()
  const dateStr = cfg.EXTENDED_REGISTRATION_ENABLED
    ? cfg.REGISTRATION_EXTENDED_DEADLINE
    : cfg.REGISTRATION_DEADLINE
  return new Date(dateStr)
}

export function isRegistrationOpen(): boolean {
  return new Date() < getEffectiveDeadline()
}
