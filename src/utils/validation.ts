import { z } from 'zod'

export function formatZodIssue(issue: z.ZodIssue): string {
  const path = issue.path
    .map((seg, idx) => (typeof seg === 'number' ? `[${seg}]` : idx === 0 ? String(seg) : `.${String(seg)}`))
    .join('')

  return path ? `${path}: ${issue.message}` : issue.message
}

export function formatZodError(issues: z.ZodIssue[]): string {
  if (!issues || issues.length === 0) return 'Validation error'
  const messages = Array.from(new Set(issues.map(formatZodIssue)))
  return messages.join('; ')
}
