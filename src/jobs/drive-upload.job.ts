import fs from 'fs'
import path from 'path'
import prisma from '../configs/db'
import { createChildLogger } from '../configs/logger'
import {
  PENDING_PREFIX,
  PENDING_UPLOAD_DIR,
  configuredDriveAccounts,
  driveFolders,
  getOrCreateTeamFolder,
  uploadBufferToDrive,
  type DriveAccount,
} from '../services/storage.service'
import { FailoverPool, HOUR, MINUTE } from '../utils/failover'

/**
 * Files are accepted first (spooled to disk, row saved with `gdriveId = null` and a
 * `pending:` filePath) and pushed to Google Drive here, a few at a time. Failed uploads are
 * retried with backoff, and anything still pending is picked up again after a restart.
 *
 * With a second Drive account configured, a full or unauthorized main account hands the
 * upload to the backup account instead of letting files pile up.
 */

const driveLogger = createChildLogger('DRIVE')
const CONCURRENCY = 2
const SWEEP_INTERVAL_MS = 30_000
const SWEEP_BATCH = 200
const MAX_BACKOFF_MS = 10 * 60_000

const queue: number[] = []
const inFlight = new Set<number>()
const retryState = new Map<number, { attempts: number; notBefore: number }>()
const teamFolders = new Map<string, Promise<string>>()
/** Keeps one team's files together in the account that took its first file. */
const teamAccount = new Map<string, DriveAccount>()

interface DriveMember {
  name: string
  account: DriveAccount
}

let drivePool: FailoverPool<DriveMember> | null = null

function getDrivePool() {
  drivePool ??= new FailoverPool(
    configuredDriveAccounts().map((account) => ({ name: `drive-${account}`, account })),
    'DRIVE',
  )
  return drivePool
}

/** What a Google error means for the account that raised it (see FailoverPool.classify). */
export function classifyDriveError(error: unknown): number | null {
  const e = error as {
    code?: number | string
    message?: string
    errors?: { reason?: string }[]
    response?: { data?: { error?: { errors?: { reason?: string }[] } } }
  }
  const reasons = [
    ...(e.errors ?? []),
    ...(e.response?.data?.error?.errors ?? []),
  ].map((r) => r.reason ?? '')
  const text = `${e.message ?? ''} ${reasons.join(' ')}`

  // Dead or revoked token: rest the account, but come back to it (the token may be renewed).
  if (/invalid_grant|invalid_client|unauthorized_client|invalid credentials/i.test(text) || e.code === 401) {
    return 30 * MINUTE
  }
  // Brief throttling comes first: its message ("Rate Limit Exceeded") also contains "limit exceeded".
  // Try the other account right now without sidelining this one.
  if (/userRateLimitExceeded|rateLimitExceeded|rate limit/i.test(text)) return 0
  // The account's Drive is full or over its upload quota: move on for a while.
  if (/storageQuotaExceeded|storage quota|quotaExceeded|dailyLimitExceeded/i.test(text)) {
    return HOUR
  }
  // Folder missing or not shared with this account: a configuration problem, use the other account.
  if (e.code === 404 || /notFound|File not found|folder id is not configured|credentials are not configured/i.test(text)) {
    return 10 * MINUTE
  }
  // Anything else (network trouble, 5xx) is retried later by the queue itself.
  return null
}

const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_')

function teamFolder(code: string, name: string, account: DriveAccount) {
  const key = `${account}:${code}:${name}`
  let pending = teamFolders.get(key)
  if (!pending) {
    pending = getOrCreateTeamFolder(code, name, undefined, account)
    teamFolders.set(key, pending)
    pending.catch(() => teamFolders.delete(key))
  }
  return pending
}

const REQUIREMENT_PREFIX: Record<string, string> = {
  IBCC_REQUIREMENT_FOLLOW: 'Follow_Instagram_',
  IBCC_REQUIREMENT_TWIBBON: 'Twibbon_',
  IBCC_REQUIREMENT_POSTER: 'Share_Poster_',
  IBCC_REQUIREMENT_BROADCAST: 'Share_Broadcast_',
}

type PendingRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>

function loadRow(id: number) {
  return prisma.submissionFile.findUnique({
    where: { id },
    include: {
      submission: {
        include: {
          teamcode: { select: { code: true, name: true } },
          user: { select: { name: true } },
        },
      },
    },
  })
}

async function resolveTarget(row: PendingRow, ext: string, account: DriveAccount) {
  const submission = row.submission
  const team = submission?.teamcode
  if (!submission || !team) throw new Error('Submission has no team to upload for.')

  const teamName = clean(team.name)
  const folders = driveFolders(account)

  if (submission.stage === 'REGISTRATION' && submission.type !== 'PAYMENT') {
    const folderId = await teamFolder(team.code, team.name, account)
    const fileName =
      submission.event === 'IBCC_REQUIREMENT_KTM'
        ? `KTM_${clean(submission.user?.name || 'Team Leader')}${ext}`
        : `${REQUIREMENT_PREFIX[submission.event] ?? `${clean(submission.event)}_`}${teamName}${ext}`
    return { folderId, fileName }
  }

  if (submission.type === 'PAYMENT') {
    if (!folders.payment) throw new Error('Google Drive Payment folder ID is not configured.')
    return { folderId: folders.payment, fileName: `[${team.code}]_${teamName}_PaymentProof${ext}` }
  }

  if (submission.stage === 'SEMIFINAL') {
    if (!folders.semifinal) throw new Error('Google Drive Semifinal Slides folder ID is not configured.')
    return { folderId: folders.semifinal, fileName: `[${team.code}]_${teamName}_Semifinal_Slides${ext}` }
  }

  if (!folders.preliminary) throw new Error('Google Drive Preliminary folder ID is not configured.')
  return { folderId: folders.preliminary, fileName: `[${team.code}]_${teamName}_Preliminary${ext}` }
}

async function processFile(id: number) {
  const row = await loadRow(id)
  if (!row || row.gdriveId || !row.filePath.startsWith(PENDING_PREFIX)) return

  const localName = path.basename(row.filePath.slice(PENDING_PREFIX.length))
  const localPath = path.join(PENDING_UPLOAD_DIR, localName)
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local copy ${localName} is missing.`)
  }

  const ext = path.extname(localName) || '.pdf'
  const pool = getDrivePool()
  const teamCode = row.submission?.teamcode?.code
  const preferred = teamCode ? teamAccount.get(teamCode) : undefined
  const candidates = [...pool.members].sort(
    (a, b) => Number(b.account === preferred) - Number(a.account === preferred),
  )

  const { result, account } = await pool.run(
    candidates,
    async (member) => {
      const { folderId, fileName } = await resolveTarget(row, ext, member.account)
      // A fresh stream per attempt: a failed upload has already consumed the previous one.
      const uploaded = await uploadBufferToDrive(
        fs.createReadStream(localPath),
        fileName,
        row.fileType || 'application/octet-stream',
        folderId,
        member.account,
      )
      return { result: uploaded, account: member.account }
    },
    classifyDriveError,
  )

  if (teamCode) teamAccount.set(teamCode, account)
  if (account !== 1) driveLogger.warn({ fileId: id, account }, 'Stored file in backup Drive account')

  await prisma.submissionFile.update({
    where: { id },
    data: { filePath: result.webViewLink, gdriveId: result.fileId },
  })

  if (row.submission?.stage === 'SEMIFINAL' && row.submission.teamId) {
    await prisma.slideDeck.create({
      data: { teamId: row.submission.teamId, fileUrl: result.webViewLink },
    })
  }

  // The local copy is only dropped once Drive and the database both have the file.
  fs.unlink(localPath, () => {})
  retryState.delete(id)
}

/** For the admin console: which Drive accounts are usable and how many files are waiting. */
export async function getDriveStatus() {
  const waiting = await prisma.submissionFile.count({
    where: { gdriveId: null, filePath: { startsWith: PENDING_PREFIX } },
  })
  return {
    waitingFiles: waiting,
    accounts: getDrivePool().status().map((s) => ({
      name: s.name,
      up: s.up,
      restingForMinutes: Math.ceil(s.downForMs / MINUTE),
    })),
  }
}

function pump() {
  while (inFlight.size < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!
    inFlight.add(id)

    processFile(id)
      .catch((error: Error) => {
        const attempts = (retryState.get(id)?.attempts ?? 0) + 1
        const delay = Math.min(15_000 * 2 ** (attempts - 1), MAX_BACKOFF_MS)
        retryState.set(id, { attempts, notBefore: Date.now() + delay })
        driveLogger.error(
          { err: error, fileId: id, attempts, delayMs: delay, repeatedFailure: attempts >= 5 },
          'File upload failed, scheduling retry',
        )
      })
      .finally(() => {
        inFlight.delete(id)
        pump()
      })
  }
}

export function enqueueDriveUpload(id: number) {
  if (inFlight.has(id) || queue.includes(id)) return
  queue.push(id)
  pump()
}

const BACKLOG_COUNT = 20
const BACKLOG_AGE_MS = 10 * 60_000
const BACKLOG_WARN_EVERY_MS = 5 * 60_000
let lastBacklogWarning = 0

/** One loud line (at most every 5 minutes) when files keep waiting, e.g. the Drive token is dead. */
function warnAboutBacklog(count: number, oldest: Date | undefined, now: number) {
  if (count === 0 || now - lastBacklogWarning < BACKLOG_WARN_EVERY_MS) return
  const ageMs = oldest ? now - oldest.getTime() : 0
  if (count < BACKLOG_COUNT && ageMs < BACKLOG_AGE_MS) return

  lastBacklogWarning = now
  driveLogger.warn({ count, ageMinutes: Math.round(ageMs / 60_000) }, 'Drive upload backlog detected; check token and pending disk space')
}

async function sweepPending() {
  try {
    const rows = await prisma.submissionFile.findMany({
      where: { gdriveId: null, filePath: { startsWith: PENDING_PREFIX } },
      select: { id: true, uploadedAt: true },
      orderBy: { id: 'asc' },
      take: SWEEP_BATCH,
    })

    const now = Date.now()
    warnAboutBacklog(rows.length, rows[0]?.uploadedAt, now)
    for (const { id } of rows) {
      if ((retryState.get(id)?.notBefore ?? 0) <= now) enqueueDriveUpload(id)
    }
  } catch (error) {
    driveLogger.error({ err: error }, 'Drive pending sweep failed')
  }
}

export function startDriveUploadWorker() {
  void sweepPending()
  setInterval(sweepPending, SWEEP_INTERVAL_MS).unref()
}
