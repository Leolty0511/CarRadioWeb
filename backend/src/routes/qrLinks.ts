import crypto from 'node:crypto'
import { Request, Response, Router } from 'express'
import { Types } from 'mongoose'
import { ZodError } from 'zod'
import QrLinkHub from '../models/QrLinkHub'
import { authenticateUser, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../middleware/errorHandler'
import { PERMISSIONS } from '../config/permissions'
import { createLogger } from '../utils/logger'
import { parseQrLinkHubInput, qrTokenSchema } from '../utils/qrLinkHubValidation'

const router = Router()
const logger = createLogger('qr-links-route')

type PublicQrHub = {
  token: string
  title: string
  description: string
  links: Array<{
    id: string
    label: string
    description: string
    url: string
    type: string
  }>
}

function validationError(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message || 'invalid_payload'
  return error instanceof Error ? error.message : 'invalid_payload'
}

async function createUniqueToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(9).toString('base64url')
    if (!(await QrLinkHub.exists({ token }))) return token
  }
  throw new Error('token_generation_failed')
}

router.get('/public/:token', asyncHandler(async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store')
  const parsedToken = qrTokenSchema.safeParse(req.params.token)
  if (!parsedToken.success) return res.status(404).json({ success: false, error: 'qr_page_not_found' })

  const hub = await QrLinkHub.findOne({ token: parsedToken.data })
    .select('token title description enabled links')
    .lean()
  if (!hub) return res.status(404).json({ success: false, error: 'qr_page_not_found' })
  if (!hub.enabled) return res.status(410).json({ success: false, error: 'qr_page_disabled' })

  const data: PublicQrHub = {
    token: hub.token,
    title: hub.title,
    description: hub.description,
    links: hub.links
      .filter((item) => item.enabled)
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        id: String(item._id),
        label: item.label,
        description: item.description,
        url: item.url,
        type: item.type,
      })),
  }
  return res.json({ success: true, data })
}))

router.use(authenticateUser)

router.get('/', requirePermission(PERMISSIONS.qrCodes.read), asyncHandler(async (_req: Request, res: Response) => {
  const items = await QrLinkHub.find()
    .select('token name title description enabled links createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean()
  return res.json({ success: true, data: items })
}))

router.post('/', requirePermission(PERMISSIONS.qrCodes.create), async (req, res, next) => {
  try {
    const input = parseQrLinkHubInput(req.body)
    const token = await createUniqueToken()
    const hub = await QrLinkHub.create({
      ...input,
      token,
      createdBy: req.user!._id,
      updatedBy: req.user!._id,
    })
    return res.status(201).json({ success: true, data: hub })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: validationError(error) })
    }
    logger.error({ error }, 'Failed to create QR link hub')
    return next(error)
  }
})

router.put('/:id', requirePermission(PERMISSIONS.qrCodes.update), async (req, res, next) => {
  if (!Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, error: 'invalid_qr_page_id' })
  }
  try {
    const input = parseQrLinkHubInput(req.body)
    const hub = await QrLinkHub.findByIdAndUpdate(req.params.id, {
      $set: { ...input, updatedBy: req.user!._id },
    }, { new: true, runValidators: true })
    if (!hub) return res.status(404).json({ success: false, error: 'qr_page_not_found' })
    return res.json({ success: true, data: hub })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: validationError(error) })
    }
    logger.error({ error }, 'Failed to update QR link hub')
    return next(error)
  }
})

router.delete('/:id', requirePermission(PERMISSIONS.qrCodes.delete), asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, error: 'invalid_qr_page_id' })
  }
  const deleted = await QrLinkHub.findByIdAndDelete(req.params.id)
  if (!deleted) return res.status(404).json({ success: false, error: 'qr_page_not_found' })
  return res.json({ success: true })
}))

export default router
