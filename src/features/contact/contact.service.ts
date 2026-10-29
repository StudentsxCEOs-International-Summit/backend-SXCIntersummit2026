import prisma from '../../configs/db'
import { env } from '../../configs/env'
import { sendMail } from '../../services/mail.service'
import type { CreateContactInput, ListContactQuery } from './contact.schema'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function createContactMessage(input: CreateContactInput) {
  const saved = await prisma.contactMessage.create({
    data: {
      name: input.name,
      organization: input.organization,
      email: input.email,
      type: input.type,
      message: input.message,
    },
    select: { id: true, createdAt: true },
  })

  // Optional heads-up to the committee. The message is already stored, so a mail failure is only logged.
  if (env.CONTACT_NOTIFY_EMAIL) {
    sendMail({
      to: env.CONTACT_NOTIFY_EMAIL,
      subject: `[SXC Intersummit 2026] New partnership enquiry: ${input.type} (${input.organization})`,
      html: `
        <p><strong>${escapeHtml(input.name)}</strong> from <strong>${escapeHtml(input.organization)}</strong>
        (${escapeHtml(input.email)}) is interested in <strong>${escapeHtml(input.type)}</strong>.</p>
        <p style="white-space: pre-wrap;">${escapeHtml(input.message)}</p>
        <p>You can also read it in the admin console under Messages.</p>
      `,
      text: `${input.name} (${input.organization}, ${input.email}) - ${input.type}\n\n${input.message}`,
    }).catch((error) => console.error('[CONTACT] Notification email failed:', error.message))
  }

  return saved
}

export async function listContactMessages({ status, page, pageSize }: ListContactQuery) {
  const where = status ? { status } : {}
  const [items, total, counts] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.groupBy({ by: ['status'], _count: { _all: true } }),
  ])

  return {
    items,
    total,
    page,
    pageSize,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
  }
}

export async function updateContactStatus(id: number, status: 'NEW' | 'READ' | 'ARCHIVED') {
  const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return null
  return prisma.contactMessage.update({ where: { id }, data: { status } })
}
