import { Request, Response } from 'express'
import { createChildLogger } from '../../configs/logger'
import { ok, notFound, internalError } from '../../utils/response'

const contactLogger = createChildLogger('CONTACT')
import type { CreateContactInput, ListContactQuery } from './contact.schema'
import { createContactMessage, listContactMessages, updateContactStatus } from './contact.service'

// POST /contact (public)
export async function submitContact(req: Request, res: Response) {
  try {
    const input = req.body as CreateContactInput

    // A filled honeypot means a bot: answer as if it worked so it learns nothing, store nothing.
    if (input.website && input.website.trim() !== '') {
      return ok(res, null, 'Thank you! Your message has been received.', 201)
    }

    await createContactMessage(input)
    return ok(res, null, 'Thank you! Your message has been received.', 201)
  } catch (error: any) {
    contactLogger.error({ err: error }, 'Contact message submission error')
    return internalError(res, 'Failed to send your message. Please try again later.')
  }
}

// GET /contact (admin)
export async function listContact(req: Request, res: Response) {
  try {
    const data = await listContactMessages(req.query as unknown as ListContactQuery)
    return ok(res, data, 'Messages retrieved successfully.')
  } catch (error: any) {
    contactLogger.error({ err: error }, 'Contact messages listing error')
    return internalError(res, 'Failed to retrieve messages.')
  }
}

// PATCH /contact/:id (admin)
export async function updateContact(req: Request, res: Response) {
  try {
    const updated = await updateContactStatus(Number(req.params.id), req.body.status)
    if (!updated) return notFound(res, 'Message not found.')
    return ok(res, updated, 'Message updated.')
  } catch (error: any) {
    contactLogger.error({ err: error, contactId: req.params.id }, 'Contact message status update error')
    return internalError(res, 'Failed to update the message.')
  }
}
