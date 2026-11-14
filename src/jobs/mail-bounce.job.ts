import { ImapFlow } from 'imapflow'
import { env } from '../configs/env'
import { createChildLogger } from '../configs/logger'
import {
  findTrackedMail,
  forgetTrackedMail,
  getMailAccounts,
  resendThroughOtherAccount,
} from '../services/mail.service'
import { MINUTE } from '../utils/failover'

/**
 * Gmail accepts a mail over SMTP and only afterwards decides it "appears suspicious", sending a
 * "Message blocked" bounce to the sender's inbox. The send already counted as a success, so the SMTP
 * failover never sees it. This job keeps an IMAP connection to each sender's inbox (read-only: nothing is
 * marked read, moved or deleted), spots those bounces from mailer-daemon, and resends the mail through
 * the other account while it is still useful (see `retryOnBlock` in mail.service).
 *
 * Tracked mails live in memory, so run a single backend instance (or only start this job on one of them).
 */

const bounceLogger = createChildLogger('MAIL-BOUNCE')

/** Safety net next to IDLE: look for new mail even if no "exists" event arrived. */
const POLL_INTERVAL_MS = MINUTE
const MAX_RECONNECT_DELAY_MS = 10 * MINUTE

export interface ParsedBounce {
  failedRecipients: string[]
  /** Message-IDs the bounce refers to (In-Reply-To, References, the attached original headers). */
  originalMessageIds: string[]
  /** "Delivery delayed, still retrying" notices: not a failure. */
  delayed: boolean
  /** The address itself is the problem (does not exist, mailbox full): another account will not help. */
  recipientProblem: boolean
  /** The "The response was:" text, for the logs. */
  reason?: string
}

const BOUNCE_FROM = /mailer-daemon@|postmaster@/i
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const RECIPIENT_PROBLEM =
  /\b5\.1\.1\b|\b5\.1\.10\b|\b5\.2\.2\b|\b4\.2\.2\b|address not found|couldn't be found|does ?n[o']t exist|user unknown|no such user|unknown user|mailbox (is )?(full|unavailable)|inbox is full|over quota|out of storage/i
const DELAYED = /\(Delay\)|delivery (is )?delayed|will (retry|keep trying)|hasn't been delivered yet|^Action:\s*delayed/im

function splitHead(raw: string) {
  const end = raw.search(/\r?\n\r?\n/)
  const head = end === -1 ? raw : raw.slice(0, end)
  return head.replace(/\r?\n[ \t]+/g, ' ')
}

function headerValues(head: string, name: string) {
  const re = new RegExp(`^${name}:\\s*(.*)$`, 'gim')
  return [...head.matchAll(re)].map((m) => m[1].trim())
}

/** Bounce text is often quoted-printable or base64; decode enough of it to read the reason. */
function readableText(raw: string) {
  const qp = raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

  const base64Parts = [
    ...raw.matchAll(
      /Content-Type:\s*(?:text\/[a-z]+|message\/delivery-status)[^]*?Content-Transfer-Encoding:\s*base64\s*\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/gi,
    ),
  ].map((m) => {
    try {
      return Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8')
    } catch {
      return ''
    }
  })

  return [qp, ...base64Parts]
    .join('\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;/g, "'")
}

/** Reads a raw bounce message. Returns null for anything that is not a mailer-daemon bounce. */
export function parseBounce(raw: string): ParsedBounce | null {
  const head = splitHead(raw)
  const from = headerValues(head, 'From').join(' ')
  if (!BOUNCE_FROM.test(from)) return null

  const text = readableText(raw)
  const ownMessageId = headerValues(head, 'Message-ID')[0]?.toLowerCase()

  const failed = new Set<string>()
  for (const value of headerValues(head, 'X-Failed-Recipients')) {
    for (const email of value.match(EMAIL) ?? []) failed.add(email.toLowerCase())
  }
  for (const m of text.matchAll(/(?:message to|delivered to|Final-Recipient:\s*rfc822;)\s*<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    failed.add(m[1].toLowerCase())
  }

  const ids = new Set<string>()
  const idSources = [
    ...headerValues(head, 'In-Reply-To'),
    ...headerValues(head, 'References'),
    ...[...raw.matchAll(/^Message-ID:\s*(<[^>\r\n]+>)/gim)].map((m) => m[1]),
  ]
  for (const value of idSources) {
    for (const id of value.match(/<[^>\s]+>/g) ?? []) {
      if (id.toLowerCase() !== ownMessageId) ids.add(id)
    }
  }

  const reason = text
    .match(/The response (?:from the remote server )?was:\s*([^\r\n]+(?:\r?\n[^\r\n]+)?)/i)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim()

  return {
    failedRecipients: [...failed],
    originalMessageIds: [...ids],
    delayed: DELAYED.test(text) || /\(Delay\)/i.test(headerValues(head, 'Subject').join(' ')),
    recipientProblem: RECIPIENT_PROBLEM.test(text),
    reason,
  }
}

/** Resends the mail a bounce is about, when it makes sense. Exported for tests and manual runs. */
export async function handleBounce(accountName: string, bounce: ParsedBounce) {
  if (bounce.delayed) return

  const mail = findTrackedMail({
    sender: accountName,
    messageIds: bounce.originalMessageIds,
    recipients: bounce.failedRecipients,
  })
  const context = { account: accountName, to: bounce.failedRecipients, reason: bounce.reason }

  if (!mail) {
    bounceLogger.info(context, 'Bounce for a mail that is not set up for resending; ignored')
    return
  }
  if (bounce.recipientProblem) {
    forgetTrackedMail(mail)
    bounceLogger.info(context, 'Bounce is about the recipient address; not resending')
    return
  }

  const outcome = await resendThroughOtherAccount(mail)
  switch (outcome.status) {
    case 'resent':
      bounceLogger.warn({ ...context, resentVia: outcome.sender }, 'Mail was blocked; resent through the other account')
      break
    case 'expired':
      bounceLogger.warn(context, 'Mail was blocked, but it expired before the bounce arrived; not resending')
      break
    case 'no-account-left':
      bounceLogger.error({ ...context, tried: mail.triedSenders }, 'Mail was blocked on every account')
      break
    case 'failed':
      bounceLogger.error({ ...context, error: outcome.error }, 'Mail was blocked and resending it failed')
      break
  }
}

class InboxWatcher {
  private client: ImapFlow | null = null
  private lastUid = 0
  private queue: Promise<void> = Promise.resolve()
  private checkQueued = false
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(private readonly account: { name: string; user: string; pass: string }) {}

  start() {
    void this.connect()
    setInterval(() => this.queueCheck(), POLL_INTERVAL_MS).unref()
  }

  private async connect() {
    const client = new ImapFlow({
      host: env.IMAP_HOST,
      port: env.IMAP_PORT,
      secure: true,
      auth: { user: this.account.user, pass: this.account.pass },
      logger: false,
    })
    client.on('error', (err) => {
      bounceLogger.warn({ account: this.account.name, err }, 'IMAP connection error')
    })
    client.on('close', () => {
      if (this.client !== client) return
      this.client = null
      this.scheduleReconnect()
    })
    client.on('exists', () => this.queueCheck())

    try {
      await client.connect()
      // EXAMINE (read-only): the watcher never changes flags, so the team still sees bounces as unread.
      const mailbox = await client.mailboxOpen('INBOX', { readOnly: true })
      if (this.lastUid === 0 || mailbox.uidNext - 1 < this.lastUid) this.lastUid = mailbox.uidNext - 1
      this.client = client
      this.reconnectAttempts = 0
      bounceLogger.info({ account: this.account.name }, 'Watching inbox for blocked-mail bounces')
      this.queueCheck()
    } catch (err) {
      bounceLogger.error({ account: this.account.name, err }, 'Could not open the inbox over IMAP (is IMAP enabled for this Gmail account?)')
      client.close()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    const delay = Math.min(15_000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
    this.reconnectTimer.unref()
  }

  /** Runs checks one at a time; a burst of events collapses into a single extra check. */
  private queueCheck() {
    if (this.checkQueued) return
    this.checkQueued = true
    this.queue = this.queue.then(async () => {
      this.checkQueued = false
      try {
        await this.check()
      } catch (err) {
        bounceLogger.warn({ account: this.account.name, err }, 'Checking the inbox for bounces failed')
      }
    })
  }

  private async check() {
    const client = this.client
    if (!client?.usable) return

    const found = await client.search({ uid: `${this.lastUid + 1}:*` }, { uid: true })
    const fresh = (found || []).filter((uid) => uid > this.lastUid).sort((a, b) => a - b)
    if (fresh.length === 0) return

    const headers = await client.fetchAll(fresh, { uid: true, envelope: true }, { uid: true })
    const bounceUids = headers
      .filter((msg) => msg.envelope?.from?.some((f) => BOUNCE_FROM.test(f.address ?? '')))
      .map((msg) => msg.uid)
    this.lastUid = Math.max(this.lastUid, ...fresh)
    if (bounceUids.length === 0) return

    const bounces = await client.fetchAll(bounceUids, { uid: true, source: true }, { uid: true })
    for (const msg of bounces) {
      const parsed = msg.source ? parseBounce(msg.source.toString('utf8')) : null
      if (parsed) await handleBounce(this.account.name, parsed)
    }
  }
}

let started = false

export function startMailBounceWatcher() {
  if (started) return
  if (!env.MAIL_BOUNCE_WATCH) {
    bounceLogger.info('Bounce watcher turned off (MAIL_BOUNCE_WATCH=false)')
    return
  }
  const accounts = getMailAccounts()
  if (accounts.length < 2) {
    bounceLogger.info('Bounce watcher not started: it needs a second SMTP account (SMTP_USER_2 / SMTP_PASS_2) to resend through')
    return
  }
  started = true
  for (const account of accounts) new InboxWatcher(account).start()
}
