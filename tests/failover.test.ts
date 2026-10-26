/**
 * Run with: npx tsx --test tests/failover.test.ts
 * Covers the second-account failover rules without touching SMTP or Google Drive.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FailoverPool, HOUR, MINUTE } from '../src/utils/failover'
import { classifyMailError } from '../src/services/mail.service'
import { classifyDriveError } from '../src/jobs/drive-upload.job'

const members = () => [{ name: 'a' }, { name: 'b' }]
const quota = () => Object.assign(new Error('storageQuotaExceeded'), { code: 403 })

test('moves to the second account and rests the first one', async () => {
  const pool = new FailoverPool(members(), 'TEST')
  const calls: string[] = []
  const attempt = async (m: { name: string }) => {
    calls.push(m.name)
    if (m.name === 'a') throw quota()
    return 'ok-' + m.name
  }
  const classify = () => HOUR

  assert.equal(await pool.run(pool.members, attempt, classify), 'ok-b')
  assert.deepEqual(calls, ['a', 'b'])

  calls.length = 0
  assert.equal(await pool.run(pool.members, attempt, classify), 'ok-b')
  assert.deepEqual(calls, ['b'], 'the resting account is skipped on the next call')
  assert.equal(pool.status().find((s) => s.name === 'a')?.up, false)
})

test('does not try the other account when the failure is not the account\'s fault', async () => {
  const pool = new FailoverPool(members(), 'TEST')
  const calls: string[] = []
  await assert.rejects(
    pool.run(
      pool.members,
      async (m) => {
        calls.push(m.name)
        throw new Error('bad recipient')
      },
      () => null,
    ),
    /bad recipient/,
  )
  assert.deepEqual(calls, ['a'])
})

test('a transient failure tries the next account but keeps the first in rotation', async () => {
  const pool = new FailoverPool(members(), 'TEST')
  const result = await pool.run(
    pool.members,
    async (m) => {
      if (m.name === 'a') throw new Error('timeout')
      return m.name
    },
    () => 0,
  )
  assert.equal(result, 'b')
  assert.equal(pool.status().find((s) => s.name === 'a')?.up, true)
})

test('reports an error when every account is resting or fails', async () => {
  const pool = new FailoverPool(members(), 'TEST')
  await assert.rejects(
    pool.run(pool.members, async () => { throw quota() }, () => HOUR),
    /storageQuotaExceeded/,
  )
  await assert.rejects(pool.run(pool.members, async () => 'never', () => HOUR), /no account is available/)
})

test('classifies Gmail errors', () => {
  assert.equal(classifyMailError(new Error('550 5.4.5 Daily user sending limit exceeded')), 3 * HOUR)
  assert.equal(classifyMailError(Object.assign(new Error('Invalid login'), { code: 'EAUTH' })), HOUR)
  assert.equal(classifyMailError(new Error('Username and Password not accepted')), HOUR)
  assert.equal(classifyMailError(new Error('550 5.1.1 The email account does not exist')), null)
  assert.equal(classifyMailError(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' })), 0)
})

test('classifies Google Drive errors', () => {
  assert.equal(classifyDriveError(new Error('invalid_grant')), 30 * MINUTE)
  assert.equal(classifyDriveError(Object.assign(new Error('Login Required'), { code: 401 })), 30 * MINUTE)
  assert.equal(classifyDriveError(Object.assign(new Error('The user storage quota has been exceeded'), { code: 403 })), HOUR)
  assert.equal(
    classifyDriveError({ message: 'Forbidden', errors: [{ reason: 'storageQuotaExceeded' }] }),
    HOUR,
  )
  assert.equal(classifyDriveError(Object.assign(new Error('File not found: abc'), { code: 404 })), 10 * MINUTE)
  assert.equal(classifyDriveError(new Error('Rate Limit Exceeded: userRateLimitExceeded')), 0)
  assert.equal(classifyDriveError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })), null)
})
