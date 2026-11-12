import { Router } from 'express'
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware'
import { validateRequest } from '../../middlewares/validation.middleware'
import { contactRateLimiter } from '../../middlewares/rate-limiter.middleware'
import * as ContactController from './contact.controller'
import {
  contactIdParamSchema,
  createContactSchema,
  listContactQuerySchema,
  updateContactSchema,
} from './contact.schema'

const contactRouter = Router()

// Public: partnership enquiry from the Contact page
contactRouter.post(
  '/',
  contactRateLimiter,
  validateRequest({ body: createContactSchema }),
  ContactController.submitContact,
)

// Staff: read and triage the enquiries
contactRouter.get(
  '/',
  requireAuth,
  requireAdmin,
  validateRequest({ query: listContactQuerySchema }),
  ContactController.listContact,
)

contactRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validateRequest({ params: contactIdParamSchema, body: updateContactSchema }),
  ContactController.updateContact,
)

export default contactRouter
