/**
 * Admin user management routes
 * Most endpoints require super_admin; nickname update only requires auth
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import User from '../models/User'
import AdminInvitation from '../models/AdminInvitation'
import { requireSuperAdmin } from '../middleware/auth'
import { ALL_PERMISSIONS } from '../config/permissions'
import { createLogger } from '../utils/logger'
import emailVerificationService from '../services/emailVerificationService'

const logger = createLogger('users-route')

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_EXPIRES_MS = 48 * 60 * 60 * 1000

const router = Router()

function buildInviteUrl(token: string): string {
  const base = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '')
  return `${base}/admin?invite=${encodeURIComponent(token)}`
}

function normalizePermissions(permissions: unknown): string[] {
  return Array.isArray(permissions)
    ? permissions.filter((p: unknown): p is string => typeof p === 'string' && ALL_PERMISSIONS.includes(p as any))
    : []
}

function hasInvalidPermissions(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.some((p) => typeof p !== 'string' || !ALL_PERMISSIONS.includes(p as any))
}

/**
 * PUT /api/users/me/nickname — any authenticated admin can update their own nickname
 * Must be defined BEFORE router.use(requireSuperAdmin) so it's not blocked
 */
router.put('/me/nickname', async (req: Request, res: Response) => {
  try {
    const { nickname } = req.body

    if (!nickname?.trim()) {
      return res.status(400).json({ success: false, error: 'nickname_required' })
    }

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'not_authenticated' })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }

    user.nickname = nickname.trim()
    await user.save()
    res.json({ success: true, data: user })
  } catch (error) {
    logger.error({ error }, 'Update own nickname failed')
    res.status(500).json({ success: false, error: 'update_failed' })
  }
})

// All remaining routes require super_admin (authenticateUser already applied in index.ts)
router.use(requireSuperAdmin)

/** GET /api/users — list all admin users */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await User.find()
      .select('-__v')
      .sort({ createdAt: -1 })
    res.json({ success: true, data: users })
  } catch (error) {
    logger.error({ error }, 'Fetch users failed')
    res.status(500).json({ success: false, error: 'fetch_failed' })
  }
})

/** GET /api/users/permissions — return all available permissions */
router.get('/permissions', (_req: Request, res: Response) => {
  res.json({ success: true, data: ALL_PERMISSIONS })
})

/** POST /api/users — create a new admin (invited by super_admin) */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email, nickname, permissions } = req.body

    if (!nickname?.trim()) {
      return res.status(400).json({ success: false, error: 'nickname_required' })
    }

    if (!email?.trim()) {
      return res.status(400).json({ success: false, error: 'email_required' })
    }
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!EMAIL_SHAPE.test(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'invalid_email' })
    }
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }

    await AdminInvitation.updateMany(
      { email: normalizedEmail, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    )

    if (hasInvalidPermissions(permissions)) {
      return res.status(400).json({ success: false, error: 'invalid_permissions' })
    }

    const safePermissions = normalizePermissions(permissions)
    const token = crypto.randomBytes(32).toString('base64url')
    const invitation = await AdminInvitation.create({
      email: normalizedEmail,
      nickname: nickname.trim(),
      permissions: safePermissions,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      invitedBy: req.user!._id,
      expiresAt: new Date(Date.now() + INVITE_EXPIRES_MS),
    })

    const emailResult = await emailVerificationService.sendAdminInvitation(
      normalizedEmail,
      buildInviteUrl(token),
      invitation.nickname
    )
    if (!emailResult.success) {
      invitation.revokedAt = new Date()
      await invitation.save()
      return res.status(400).json({ success: false, error: emailResult.error || 'send_failed' })
    }

    res.status(201).json({ success: true, data: invitation })
  } catch (error: any) {
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({ success: false, error: 'active_invitation_exists' })
    }
    logger.error({ error }, 'Invite user failed')
    res.status(500).json({ success: false, error: 'invite_failed' })
  }
})

/** PUT /api/users/:id — update admin nickname, permissions, isActive */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { nickname, permissions, isActive } = req.body

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }

    // Cannot modify super_admin via this endpoint
    if (user.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'cannot_modify_super_admin' })
    }

    if (nickname !== undefined) user.nickname = String(nickname).trim()
    if (hasInvalidPermissions(permissions)) {
      return res.status(400).json({ success: false, error: 'invalid_permissions' })
    }
    if (Array.isArray(permissions)) user.permissions = normalizePermissions(permissions)
    if (typeof isActive === 'boolean') user.isActive = isActive

    await user.save()
    res.json({ success: true, data: user })
  } catch (error) {
    logger.error({ error }, 'Update user failed')
    res.status(500).json({ success: false, error: 'update_failed' })
  }
})

/** DELETE /api/users/:id — remove an admin */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }

    // Cannot delete super_admin
    if (user.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'cannot_delete_super_admin' })
    }

    await User.findByIdAndDelete(id)
    res.json({ success: true })
  } catch (error) {
    logger.error({ error, userId: req.params.id }, 'Delete user failed')
    res.status(500).json({ success: false, error: 'delete_failed' })
  }
})

export default router
