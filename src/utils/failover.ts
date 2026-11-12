/**
 * Small helper for "try account A, fall back to account B" (SMTP senders, Drive accounts).
 *
 * `classify` decides what a failure means for the member that just failed:
 *  - a number > 0: take it out of rotation for that many ms, then try the next member
 *  - 0:            try the next member, but keep this one in rotation (e.g. a network blip)
 *  - null:         not the account's fault (bad recipient, corrupt file); rethrow right away
 */
import { createChildLogger } from '../configs/logger'

const failoverLogger = createChildLogger('FAILOVER')

export type Classify = (error: unknown) => number | null

export class FailoverPool<T extends { name: string }> {
  private downUntil = new Map<string, number>()

  constructor(
    readonly members: T[],
    private readonly label: string,
  ) {}

  isUp(member: T, now = Date.now()) {
    return (this.downUntil.get(member.name) ?? 0) <= now
  }

  markDown(member: T, ms: number, reason: string) {
    this.downUntil.set(member.name, Date.now() + ms)
    failoverLogger.error({ pool: this.label, member: member.name, downDurationMinutes: Math.round(ms / 60_000), reason }, 'Member taken out of rotation')
  }

  status(now = Date.now()) {
    return this.members.map((member) => ({
      name: member.name,
      up: this.isUp(member, now),
      downForMs: Math.max(0, (this.downUntil.get(member.name) ?? 0) - now),
    }))
  }

  /** Runs `attempt` on each candidate in order until one succeeds. */
  async run<R>(
    candidates: T[],
    attempt: (member: T) => Promise<R>,
    classify: Classify,
  ): Promise<R> {
    const usable = candidates.filter((member) => this.isUp(member))
    if (usable.length === 0) {
      throw new Error(`${this.label}: no account is available right now.`)
    }

    let lastError: unknown
    for (const member of usable) {
      try {
        return await attempt(member)
      } catch (error) {
        const decision = classify(error)
        if (decision === null) throw error
        lastError = error
        const reason = error instanceof Error ? error.message : String(error)
        if (decision > 0) this.markDown(member, decision, reason)
        else failoverLogger.warn({ pool: this.label, member: member.name, reason }, 'Member failed, attempting next account')
      }
    }
    throw lastError
  }
}

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
