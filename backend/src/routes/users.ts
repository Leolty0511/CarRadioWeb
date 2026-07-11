/**
 * Admin user management routes
 * Most endpoints require super_admin; nickname update only requires auth
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User from '../models/User'
import AdminInvitation from '../models/AdminInvitation'
import { requireSuperAdmin } from '../middleware/auth'
import { ALL_PERMISSIONS } from '../config/permissions'
import { createLogger } from '../utils/logger'
import { isDuplicateKeyOnField } from '../utils/mongoErrors'
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

function isTransactionUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Transaction numbers are only allowed') ||
    message.includes('replica set member or mongos')
}

/** Standalone MongoDB fallback: serialized conditional swap with rollback on failure. */
async function transferWithoutTransaction(currentUserId: unknown, targetUserId: string): Promise<void> {
  const locks = mongoose.connection.collection('admin_operation_locks')
  const owner = crypto.randomUUID()
  const now = new Date()
  try {
    await locks.findOneAndUpdate(
      { _id: 'super-admin-transfer' as any, $or: [{ expiresAt: { $lte: now } }, { owner }] },
      { $set: { owner, expiresAt: new Date(now.getTime() + 30_000) } },
      { upsert: true }
    )
  } catch (error) {
    if (isDuplicateKeyOnField(error, '_id')) {throw new Error('TRANSFER_IN_PROGRESS')}
    throw error
  }

  let demoted = false
  try {
    const target = await User.exists({ _id: targetUserId, role: 'admin', isActive: true })
    if (!target) {throw new Error('TARGET_NOT_ELIGIBLE')}

    const demoteResult = await User.updateOne(
      { _id: currentUserId, role: 'super_admin', isActive: true },
      { $set: { role: 'admin' } }
    )
    if (demoteResult.modifiedCount !== 1) {throw new Error('SUPER_ADMIN_CHANGED')}
    demoted = true

    const promoteResult = await User.updateOne(
      { _id: targetUserId, role: 'admin', isActive: true },
      { $set: { role: 'super_admin', permissions: [] } }
    )
    if (promoteResult.modifiedCount !== 1) {throw new Error('TARGET_NOT_ELIGIBLE')}
  } catch (error) {
    if (demoted) {
      await User.updateOne({ _id: currentUserId, role: 'admin' }, { $set: { role: 'super_admin' } })
    }
    throw error
  } finally {
    await locks.deleteOne({ _id: 'super-admin-transfer' as any, owner })
  }
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

/** POST /api/users/transfer-super-admin — atomically transfer ownership to an active admin */
router.post('/transfer-super-admin', async (req: Request, res: Response) => {
  const session = await mongoose.startSession()
  try {
    const targetUserId = String(req.body.targetUserId || '')
    const currentPassword = String(req.body.currentPassword || '')

    if (!mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ success: false, error: 'invalid_target_user' })
    }
    if (String(req.user!._id) === targetUserId) {
      return res.status(400).json({ success: false, error: 'cannot_transfer_to_self' })
    }

    const currentUser = await User.findById(req.user!._id).select('+passwordHash')
    if (!currentUser || currentUser.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'super_admin_required' })
    }
    if (!currentUser.passwordHash || !currentPassword) {
      return res.status(400).json({ success: false, error: 'current_password_required' })
    }
    if (!(await bcrypt.compare(currentPassword, currentUser.passwordHash))) {
      return res.status(401).json({ success: false, error: 'current_password_incorrect' })
    }

    try {
      await session.withTransaction(async () => {
        const targetUser = await User.findOne({ _id: targetUserId, role: 'admin', isActive: true }).session(session)
        if (!targetUser) {throw new Error('TARGET_NOT_ELIGIBLE')}

        const demoted = await User.updateOne(
          { _id: currentUser._id, role: 'super_admin', isActive: true },
          { $set: { role: 'admin' } },
          { session }
        )
        if (demoted.modifiedCount !== 1) {throw new Error('SUPER_ADMIN_CHANGED')}

        targetUser.role = 'super_admin'
        targetUser.permissions = []
        await targetUser.save({ session })
      })
    } catch (error) {
      if (!isTransactionUnsupported(error)) {throw error}
      logger.info('MongoDB transactions unavailable; using locked transfer fallback')
      await transferWithoutTransaction(currentUser._id, targetUserId)
    }

    logger.warn({ fromUserId: currentUser._id, toUserId: targetUserId }, 'Super admin ownership transferred')
    return res.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'TARGET_NOT_ELIGIBLE') {
      return res.status(400).json({ success: false, error: 'target_user_not_eligible' })
    }
    if (error instanceof Error && error.message === 'SUPER_ADMIN_CHANGED') {
      return res.status(409).json({ success: false, error: 'super_admin_changed' })
    }
    if (error instanceof Error && error.message === 'TRANSFER_IN_PROGRESS') {
      return res.status(409).json({ success: false, error: 'transfer_in_progress' })
    }
    logger.error({ error }, 'Transfer super admin failed')
    return res.status(500).json({ success: false, error: 'transfer_failed' })
  } finally {
    await session.endSession()
  }
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
  } catch (error: unknown) {
    if (isDuplicateKeyOnField(error, 'email')) {
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
