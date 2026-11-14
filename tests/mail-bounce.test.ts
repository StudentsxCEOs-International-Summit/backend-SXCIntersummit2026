/**
 * Run with: npx tsx --test tests/mail-bounce.test.ts
 * Covers reading Gmail bounces and the resend decision, without touching SMTP or IMAP.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBounce } from '../src/jobs/mail-bounce.job'

const ORIGINAL_ID = '<a1b2c3d4-0000-1111-2222-333344445555@gmail.com>'

/** Shaped like the "appears suspicious / Message blocked" bounce Gmail sends to the sender. */
const blockedBounce = [
  'Delivered-To: sender@gmail.com',
  'Return-Path: <>',
  'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
  'To: sender@gmail.com',
  'X-Failed-Recipients: student@gmail.com',
  'Subject: Delivery Status Notification (Failure)',
  `References: ${ORIGINAL_ID}`,
  `In-Reply-To: ${ORIGINAL_ID}`,
  'Message-ID: <bounce-1@mx.google.com>',
  'Content-Type: multipart/report; boundary="b1"; report-type=delivery-status',
  '',
  '--b1',
  'Content-Type: text/html; charset="UTF-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<h2>Message blocked</h2><p>Your message to <a style=3D"color: #212121">student@gmail.com</a> =',
  'has been blocked. See technical details below for more information.</p>',
  '<p>The response was:</p><p>Message rejected. See https://support.google.com/mail/answer/69585 for mo=',
  're information.</p>',
  '--b1',
  'Content-Type: message/rfc822',
  '',
  'From: "SXC International Summit" <sender@gmail.com>',
  'To: student@gmail.com',
  'Subject: [SXC Intersummit 2026] Your verification code',
  `Message-ID: ${ORIGINAL_ID}`,
  '',
  'Hi,',
  '--b1--',
].join('\r\n')

test('reads recipient, original Message-ID and reason from a "Message blocked" bounce', () => {
  const bounce = parseBounce(blockedBounce)
  assert.ok(bounce)
  assert.deepEqual(bounce.failedRecipients, ['student@gmail.com'])
  assert.ok(bounce.originalMessageIds.includes(ORIGINAL_ID))
  assert.ok(!bounce.originalMessageIds.includes('<bounce-1@mx.google.com>'))
  assert.equal(bounce.delayed, false)
  assert.equal(bounce.recipientProblem, false)
  assert.match(bounce.reason ?? '', /Message rejected/)
})

test('finds the recipient in the text when there is no X-Failed-Recipients header', () => {
  const bounce = parseBounce(blockedBounce.replace('X-Failed-Recipients: student@gmail.com\r\n', ''))
  assert.deepEqual(bounce?.failedRecipients, ['student@gmail.com'])
})

test('reads a base64-encoded bounce body', () => {
  const body = Buffer.from('Your message to student@gmail.com appears suspicious and was not delivered.').toString('base64')
  const raw = [
    'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
    'Subject: Delivery Status Notification (Failure)',
    'Content-Type: multipart/report; boundary="b2"',
    '',
    '--b2',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '--b2--',
  ].join('\r\n')
  const bounce = parseBounce(raw)
  assert.deepEqual(bounce?.failedRecipients, ['student@gmail.com'])
  assert.equal(bounce?.recipientProblem, false)
})

test('flags a non-existent address as a recipient problem (no resend)', () => {
  const raw = blockedBounce
    .replace('<h2>Message blocked</h2>', '<h2>Address not found</h2>')
    .replace('Message rejected.', '550 5.1.1 The email account that you tried to reach does not exist.')
  assert.equal(parseBounce(raw)?.recipientProblem, true)
})

test('treats a "delivery delayed" notice as not a failure', () => {
  const raw = blockedBounce.replace('(Failure)', '(Delay)')
  assert.equal(parseBounce(raw)?.delayed, true)
})

test('ignores mail that is not from mailer-daemon', () => {
  const raw = blockedBounce.replace(
    'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
    'From: Someone <someone@example.com>',
  )
  assert.equal(parseBounce(raw), null)
})
