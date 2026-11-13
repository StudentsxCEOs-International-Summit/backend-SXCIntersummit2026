import { z } from 'zod'

const TECHNICAL_CHECK =
  /prisma|invocation|ERR_[A-Z_]+|\bselect\b.+\bfrom\b|\binsert\s+into\b|\bupdate\b.+\bset\b|\bdelete\s+from\b|relation ".+"|table ".+"|syntax error|column .+/i

export function formatZodIssue(issue: z.ZodIssue): string {
  const path = issue.path
    .map((seg, idx) => (typeof seg === 'number' ? `[${seg}]` : idx === 0 ? String(seg) : `.${String(seg)}`))
    .join('')

  if (TECHNICAL_CHECK.test(issue.message)) {
    return path ? `${path}: Invalid value` : 'Invalid value'
  }

  return path ? `${path}: ${issue.message}` : issue.message
}

export function formatZodError(issues: z.ZodIssue[]): string {
  if (!issues || issues.length === 0) return 'Validation error'
  const messages = Array.from(new Set(issues.map(formatZodIssue)))
  return messages.join('; ')
}
