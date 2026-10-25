import fs from 'fs'
import path from 'path'
import prisma from '../configs/db'
import { env } from '../configs/env'
import {
  PENDING_PREFIX,
  PENDING_UPLOAD_DIR,
  getOrCreateTeamFolder,
  uploadBufferToDrive,
} from '../services/storage.service'

/**
 * Files are accepted first (spooled to disk, row saved with `gdriveId = null` and a
 * `pending:` filePath) and pushed to Google Drive here, a few at a time. Failed uploads are
 * retried with backoff, and anything still pending is picked up again after a restart.
 */

const CONCURRENCY = 2
const SWEEP_INTERVAL_MS = 30_000
const SWEEP_BATCH = 200
const MAX_BACKOFF_MS = 10 * 60_000

const queue: number[] = []
const inFlight = new Set<number>()
const retryState = new Map<number, { attempts: number; notBefore: number }>()
const teamFolders = new Map<string, Promise<string>>()

const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_')

function teamFolder(code: string, name: string) {
  const key = `${code}:${name}`
  let pending = teamFolders.get(key)
  if (!pending) {
    pending = getOrCreateTeamFolder(code, name)
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

async function resolveTarget(row: PendingRow, ext: string) {
  const submission = row.submission
  const team = submission?.teamcode
  if (!submission || !team) throw new Error('Submission has no team to upload for.')

  const teamName = clean(team.name)

  if (submission.stage === 'REGISTRATION' && submission.type !== 'PAYMENT') {
    const folderId = await teamFolder(team.code, team.name)
    const fileName =
      submission.event === 'IBCC_REQUIREMENT_KTM'
        ? `KTM_${clean(submission.user?.name || 'Team Leader')}${ext}`
        : `${REQUIREMENT_PREFIX[submission.event] ?? `${clean(submission.event)}_`}${teamName}${ext}`
    return { folderId, fileName }
  }

  const base = env.GOOGLE_DRIVE_FOLDER_IBCC_ID || env.GOOGLE_DRIVE_FOLDER_ID

  if (submission.type === 'PAYMENT') {
    const folderId = env.GOOGLE_DRIVE_FOLDER_PAYMENT_ID || base
    if (!folderId) throw new Error('Google Drive Payment folder ID is not configured.')
    return { folderId, fileName: `[${team.code}]_${teamName}_PaymentProof${ext}` }
  }

  if (submission.stage === 'SEMIFINAL') {
    const folderId = env.GOOGLE_DRIVE_FOLDER_SEMIFINAL_SLIDES_ID || base
    if (!folderId) throw new Error('Google Drive Semifinal Slides folder ID is not configured.')
    return { folderId, fileName: `[${team.code}]_${teamName}_Semifinal_Slides${ext}` }
  }

  const folderId = env.GOOGLE_DRIVE_FOLDER_PRELIMINARY_ID || base
  if (!folderId) throw new Error('Google Drive Preliminary folder ID is not configured.')
  return { folderId, fileName: `[${team.code}]_${teamName}_Preliminary${ext}` }
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
  const { folderId, fileName } = await resolveTarget(row, ext)

  const result = await uploadBufferToDrive(
    fs.createReadStream(localPath),
    fileName,
    row.fileType || 'application/octet-stream',
    folderId,
  )

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

function pump() {
  while (inFlight.size < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!
    inFlight.add(id)

    processFile(id)
      .catch((error: Error) => {
        const attempts = (retryState.get(id)?.attempts ?? 0) + 1
        const delay = Math.min(15_000 * 2 ** (attempts - 1), MAX_BACKOFF_MS)
        retryState.set(id, { attempts, notBefore: Date.now() + delay })
        console.error(
          `[DRIVE QUEUE] File ${id} failed (attempt ${attempts}), retry in ${Math.round(delay / 1000)}s: ${error.message}`,
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

async function sweepPending() {
  try {
    const rows = await prisma.submissionFile.findMany({
      where: { gdriveId: null, filePath: { startsWith: PENDING_PREFIX } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: SWEEP_BATCH,
    })

    const now = Date.now()
    for (const { id } of rows) {
      if ((retryState.get(id)?.notBefore ?? 0) <= now) enqueueDriveUpload(id)
    }
  } catch (error) {
    console.error('[DRIVE QUEUE] Sweep failed:', error)
  }
}

export function startDriveUploadWorker() {
  void sweepPending()
  setInterval(sweepPending, SWEEP_INTERVAL_MS).unref()
}
