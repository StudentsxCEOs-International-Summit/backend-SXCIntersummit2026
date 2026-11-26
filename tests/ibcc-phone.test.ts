import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerTeamSchema } from '../src/features/ibcc/ibcc.schema'

const payload = (whatsapp: string) => ({
  teamName: 'Phone Normalization Test',
  memberComposition: 'SAME_UNIVERSITY',
  sourceInfo: 'INSTAGRAM',
  leaderInfo: JSON.stringify({
    whatsapp,
    institution: 'Universitas Uji',
    major: 'Informatika',
    yearOfStudy: '3rd year',
  }),
  members: '[]',
  agreeTerms: 'true',
  confirmParticipation: 'true',
})

function parsedPhone(whatsapp: string) {
  const result = registerTeamSchema.safeParse(payload(whatsapp))
  if (!result.success) {
    assert.fail(`expected ${JSON.stringify(whatsapp)} to be accepted`)
  }
  return result.data.leaderInfo.whatsapp
}

test('accepts a plain local number unchanged', () => {
  assert.equal(parsedPhone('08123456789'), '08123456789')
})

test('accepts common human formatting and stores one canonical form', () => {
  const inputs = [
    '+62 812-3456-789',
    '0812.3456.789',
    '(0812) 3456-789',
    '628123456789',
    '8123456789',
    '+6208123456789',
  ]
  for (const input of inputs) {
    assert.equal(parsedPhone(input), '08123456789', input)
  }
})

test('drops invisible Unicode characters instead of rejecting the number', () => {
  const inputs = [
    '08123456789\u200B',
    '08123456789\u00AD',
    '08123456789\u2013',
    '\u200E08123456789',
    '08123456789\uFEFF',
  ]
  for (const input of inputs) {
    assert.equal(parsedPhone(input), '08123456789', JSON.stringify(input))
  }
})

test('normalizes full-width digits', () => {
  assert.equal(parsedPhone('０８１２３４５６７８９'), '08123456789')
})

test('keeps international numbers with an explicit country code', () => {
  assert.equal(parsedPhone('+60123456789'), '+60123456789')
  assert.equal(parsedPhone('+1 (415) 555-0132'), '+14155550132')
})

test('still rejects values that are not phone numbers', () => {
  for (const input of ['', '   ', '0215551234', 'abc', '0812']) {
    assert.equal(
      registerTeamSchema.safeParse(payload(input)).success,
      false,
      JSON.stringify(input),
    )
  }
})
