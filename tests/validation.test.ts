import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { formatZodIssue, formatZodError } from '../src/utils/validation'
import { registerTeamSchema } from '../src/features/ibcc/ibcc.schema'
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
    assert.equal(result.data.leaderInfo.whatsapp, '+6281234567890')
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
