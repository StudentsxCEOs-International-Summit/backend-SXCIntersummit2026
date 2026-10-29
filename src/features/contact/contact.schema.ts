import { z } from 'zod'

export const contactTypes = [
  'Sponsorship',
  'Media Partner',
  'Community Partner',
  'Case Collaborator',
  'Other',
] as const

export const contactStatuses = ['NEW', 'READ', 'ARCHIVED'] as const

export const createContactSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  organization: z.string().trim().min(2, 'Organization must be at least 2 characters').max(150),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(150)
    .pipe(z.email('Please enter a valid email address')),
  type: z.enum(contactTypes, { message: 'Choose what you are interested in' }),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(2000),
  // Honeypot: real visitors never see or fill this field, bots usually do.
  website: z.string().max(200).optional(),
})

export const listContactQuerySchema = z.object({
  status: z.enum(contactStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const contactIdParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
})

export const updateContactSchema = z.object({
  status: z.enum(contactStatuses),
})

export type CreateContactInput = z.infer<typeof createContactSchema>
export type ListContactQuery = z.infer<typeof listContactQuerySchema>
