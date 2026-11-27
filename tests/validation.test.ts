import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { formatZodIssue, formatZodError } from '../src/utils/validation'
import { normalizePhone, registerTeamSchema } from '../src/features/ibcc/ibcc.schema'
import { validateRequest } from '../src/middlewares/validation.middleware'

test('formatZodIssue formats nested and array path segments', () => {
  const issueWithNestedPath: z.ZodIssue = {
    code: 'custom',
    path: ['leaderInfo', 'whatsapp'],
    message: 'Please enter a valid WhatsApp number',
  }
  assert.equal(
    formatZodIssue(issueWithNestedPath),
    'leaderInfo.whatsapp: Please enter a valid WhatsApp number',
  )

  const issueWithArrayPath: z.ZodIssue = {
    code: 'custom',
    path: ['members', 0, 'email'],
    message: 'Please enter a valid email address',
  }
  assert.equal(
    formatZodIssue(issueWithArrayPath),
    'members[0].email: Please enter a valid email address',
  )
})

test('formatZodError joins multiple issues with semicolons and deduplicates', () => {
  const issues: z.ZodIssue[] = [
    {
      code: 'custom',
      path: ['teamName'],
      message: 'Team name must be at least 3 characters',
    },
    {
      code: 'custom',
      path: ['leaderInfo', 'major'],
      message: 'Major is required',
    },
  ]

  assert.equal(
    formatZodError(issues),
    'teamName: Team name must be at least 3 characters; leaderInfo.major: Major is required',
  )
})

test('registerTeamSchema accepts valid team registration payload', () => {
  const payload = {
    teamName: 'Alpha Innovators',
    memberComposition: 'SAME_UNIVERSITY',
    sourceInfo: 'INSTAGRAM',
    leaderInfo: JSON.stringify({
      whatsapp: '08123456789',
      institution: 'Universitas Indonesia',
      major: 'Computer Science',
      yearOfStudy: '3rd year',
    }),
    members: JSON.stringify([
      {
        fullName: 'Jane Doe',
        email: 'jane@ui.ac.id',
        whatsapp: '+6281298765432',
        institution: 'Universitas Indonesia',
        major: 'Information Systems',
        yearOfStudy: '2nd year',
      },
    ]),
    agreeTerms: 'true',
    confirmParticipation: 'true',
  }

  const result = registerTeamSchema.safeParse(payload)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.teamName, 'Alpha Innovators')
    assert.equal(result.data.leaderInfo.major, 'Computer Science')
    assert.equal(result.data.members.length, 1)
  }
})

test('registerTeamSchema normalizes boolean inputs from checkboxes and radio buttons', () => {
  const payload = {
    teamName: 'Beta Thinkers',
    memberComposition: 'Multiple University Students',
    sourceInfo: 'Friends/Family',
    leaderInfo: {
      whatsapp: '+62 812-3456-7890',
      institution: 'ITB',
      major: 'Management',
      yearOfStudy: '1st year',
    },
    members: '',
    agreeTerms: 'yes',
    confirmParticipation: 'on',
  }

  const result = registerTeamSchema.safeParse(payload)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.memberComposition, 'MULTIPLE_UNIVERSITIES')
    assert.equal(result.data.sourceInfo, 'FRIENDS_FAMILY')
    assert.equal(result.data.leaderInfo.whatsapp, '081234567890')
    assert.equal(result.data.agreeTerms, true)
    assert.equal(result.data.confirmParticipation, true)
    assert.deepEqual(result.data.members, [])
  }
})

test('registerTeamSchema extracts major when combined in institution string', () => {
  const payload = {
    teamName: 'Gamma Creators',
    memberComposition: 'SAME_UNIVERSITY',
    sourceInfo: 'TIKTOK',
    leaderInfo: {
      whatsapp: '08123456789',
      institution: 'Institut Teknologi Bandung - Teknik Industri',
      yearOfStudy: '4th year',
    },
    agreeTerms: true,
    confirmParticipation: true,
  }

  const result = registerTeamSchema.safeParse(payload)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.leaderInfo.institution, 'Institut Teknologi Bandung')
    assert.equal(result.data.leaderInfo.major, 'Teknik Industri')
  }
})

test('validateRequest middleware returns 400 with specific error message on failure', () => {
  const middleware = validateRequest({
    body: z.object({
      email: z.string().email('Invalid email address'),
      age: z.number().min(18, 'Must be at least 18'),
    }),
  })

  let statusCode = 0
  let responsePayload: any = null

  const mockReq: any = {
    body: { email: 'not-an-email', age: 15 },
    path: '/test',
    method: 'POST',
    headers: {},
  }
  const mockRes: any = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(payload: any) {
      responsePayload = payload
      return this
    },
  }
  const next = () => {}

  middleware(mockReq, mockRes, next)

  assert.equal(statusCode, 400)
  assert.equal(responsePayload.success, false)
  assert.equal(
    responsePayload.message,
    'email: Invalid email address; age: Must be at least 18',
  )
  assert.equal(responsePayload.errors.length, 2)
})

test('formatZodIssue prevents internal SQL query or table name leakage', () => {
  const issueWithSql: z.ZodIssue = {
    code: 'custom',
    path: ['searchQuery'],
    message: 'syntax error at or near SELECT * FROM "master_team_code"',
  }
  assert.equal(
    formatZodIssue(issueWithSql),
    'searchQuery: Invalid value',
  )
})

test('registerTeamSchema preserves optional leaderInfo.fullName and stays backward compatible', () => {
  const withName = registerTeamSchema.safeParse({
    teamName: 'Delta Team',
    memberComposition: 'SAME_UNIVERSITY',
    sourceInfo: 'INSTAGRAM',
    leaderInfo: {
      fullName: '  Muhammad Azka  ',
      whatsapp: '+6281234567890',
      institution: 'Universitas Padjadjaran',
      major: 'Bisnis Digital',
      yearOfStudy: '1st year',
    },
    members: [],
    agreeTerms: true,
    confirmParticipation: true,
  })
  assert.equal(withName.success, true)
  if (withName.success) {
    assert.equal(withName.data.leaderInfo.fullName, 'Muhammad Azka')
  }

  const withoutName = registerTeamSchema.safeParse({
    teamName: 'Delta Team',
    memberComposition: 'SAME_UNIVERSITY',
    sourceInfo: 'INSTAGRAM',
    leaderInfo: {
      whatsapp: '+6281234567890',
      institution: 'Universitas Padjadjaran',
      major: 'Bisnis Digital',
      yearOfStudy: '1st year',
    },
    members: [],
    agreeTerms: true,
    confirmParticipation: true,
  })
  assert.equal(withoutName.success, true)
  if (withoutName.success) {
    assert.equal(withoutName.data.leaderInfo.fullName, undefined)
  }
})

test('normalizePhone and registerTeamSchema strip invisible Unicode marks while preserving international codes', () => {
  assert.equal(normalizePhone('+6281212344182\u200E'), '081212344182')
  assert.equal(normalizePhone('\u2066+6281212344182\u2069'), '081212344182')
  assert.equal(normalizePhone('\u2066+81312345678\u2069'), '+81312345678')
  assert.equal(normalizePhone('\u202A0812-1234-4182\u202C'), '081212344182')
  assert.equal(normalizePhone('\u200B(0812) 1234.4182'), '081212344182')
  assert.equal(normalizePhone('   \u200E  '), '')

  const validUnicode = registerTeamSchema.safeParse({
    teamName: 'Epsilon Team',
    memberComposition: 'SAME_UNIVERSITY',
    sourceInfo: 'INSTAGRAM',
    leaderInfo: {
      whatsapp: '\u200E+62 822-6685-9292',
      institution: 'Universitas Indonesia',
      major: 'Management',
      yearOfStudy: '2nd year',
    },
    members: [
      {
        fullName: 'Kezia Nania Manik',
        email: 'kezianania.manik@gmail.com',
        whatsapp: '\u202A081212344182\u202C',
        institution: 'Institut Teknologi Bandung',
        major: 'SBM',
        yearOfStudy: '1st year',
      },
    ],
    agreeTerms: true,
    confirmParticipation: true,
  })
  assert.equal(validUnicode.success, true)
  if (validUnicode.success) {
    assert.equal(validUnicode.data.leaderInfo.whatsapp, '082266859292')
    assert.equal(validUnicode.data.members[0].whatsapp, '081212344182')
  }

  const emptyPhone = registerTeamSchema.safeParse({
    teamName: 'Epsilon Team',
    memberComposition: 'SAME_UNIVERSITY',
    sourceInfo: 'INSTAGRAM',
    leaderInfo: {
      whatsapp: '+6282266859292',
      institution: 'Universitas Indonesia',
      major: 'Management',
      yearOfStudy: '2nd year',
    },
    members: [
      {
        fullName: 'Kezia Nania Manik',
        email: 'kezianania.manik@gmail.com',
        whatsapp: '',
        institution: 'Institut Teknologi Bandung',
        major: 'SBM',
        yearOfStudy: '1st year',
      },
    ],
    agreeTerms: true,
    confirmParticipation: true,
  })
  assert.equal(emptyPhone.success, false)
})
