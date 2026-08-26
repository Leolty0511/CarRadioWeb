/**
 * Admin user management routes
 * Most endpoints require super_admin; nickname update only requires auth
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import multer from 'multer'
import sharp from 'sharp'
import User from '../models/User'
import AdminFavorite from '../models/AdminFavorite'
import BaseDocument from '../models/Document'
import AdminInvitation from '../models/AdminInvitation'
import { requireSuperAdmin } from '../middleware/auth'
import { ALL_PERMISSIONS } from '../config/permissions'
import { createLogger } from '../utils/logger'
import { isDuplicateKeyOnField } from '../utils/mongoErrors'
import emailVerificationService from '../services/emailVerificationService'
import { classifyTransferState, type TransferRole } from '../services/superAdminTransferState'
import { uploadImageToOSS } from '../services/uploadService'

const logger = createLogger('users-route')

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_EXPIRES_MS = 48 * 60 * 60 * 1000
const MIN_PASSWORD_LENGTH = 10
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
})

const router = Router()

const PAGE_PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  'pages:documents': ['documents:read'],
  'pages:products': ['products:read'],
  'pages:categories': ['categories:read'],
  'pages:vehicles': ['vehicles:read'],
  'pages:banners': ['banners:read'],
  'pages:announcements': ['announcements:read'],
  'pages:software': ['software:read'],
  'pages:resources': ['resources:read'],
  'pages:downloads': ['software:read'],
  'pages:user-manual': ['resources:read'],
  'pages:feedback': ['feedback:read'],
  'pages:forms': ['feedback:read'],
  'pages:contact': ['contacts:read'],
  'pages:canbus-settings': ['canbus:read'],
  'pages:visitors': ['visitors:read'],
  'pages:seo': ['seo:read'],
  'pages:module-settings': ['settings:read'],
  'pages:oss-storage': ['settings:read'],
  'pages:notification': ['notifications:read'],
  'pages:system-monitor': ['system:read'],
  'pages:settings': ['settings:read'],
}

function buildInviteUrl(token: string): string {
  const configuredBase = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || '').trim()
  const base = configuredBase || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001')
  if (!base) {throw new Error('INVITE_URL_NOT_CONFIGURED')}

  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    throw new Error('INVITE_URL_NOT_CONFIGURED')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {throw new Error('INVITE_URL_NOT_CONFIGURED')}
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('INVITE_URL_NOT_CONFIGURED')
  }

  return `${parsed.origin}/admin?invite=${encodeURIComponent(token)}`
}

function normalizePermissions(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) {return []}
  const normalized = new Set(
    permissions.filter((p: unknown): p is string => typeof p === 'string' && ALL_PERMISSIONS.includes(p as any))
  )
  for (const permission of [...normalized]) {
    for (const dependency of PAGE_PERMISSION_DEPENDENCIES[permission] ?? []) {
      normalized.add(dependency)
    }
  }
  return [...normalized]
}

function hasInvalidPermissions(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.some((p) => typeof p !== 'string' || !ALL_PERMISSIONS.includes(p as any))
}

function favoriteUrl(documentType: string, slugOrId: unknown): string {
  const routeType = documentType === 'structured' ? 'vehicle' : documentType === 'video' ? 'video' : 'article'
  return `/knowledge/${routeType}/${String(slugOrId)}`
}

function isTransactionUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Transaction numbers are only allowed') ||
    message.includes('replica set member or mongos')
}

/** Standalone MongoDB fallback: serialized conditional swap with rollback on failure. */
async function transferWithoutTransaction(
  currentUserId: unknown,
  targetUserId: string,
  previousPermissions: string[]
): Promise<void> {
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
    const target = await User.exists({
      _id: targetUserId,
      role: 'admin',
      isActive: true,
      mustChangeCredentials: false,
      passwordHash: { $exists: true, $ne: '' },
    })
    if (!target) {throw new Error('TARGET_NOT_ELIGIBLE')}

    const demoteResult = await User.updateOne(
      { _id: currentUserId, role: 'super_admin', isActive: true },
      { $set: { role: 'admin', permissions: ALL_PERMISSIONS } }
    )
    if (demoteResult.modifiedCount !== 1) {throw new Error('SUPER_ADMIN_CHANGED')}
    demoted = true

    const promoteResult = await User.updateOne(
      {
        _id: targetUserId,
        role: 'admin',
        isActive: true,
        mustChangeCredentials: false,
        passwordHash: { $exists: true, $ne: '' },
      },
      { $set: { role: 'super_admin', permissions: [] } }
    )
    if (promoteResult.modifiedCount !== 1) {throw new Error('TARGET_NOT_ELIGIBLE')}
  } catch (error) {
    if (demoted) {
      const readState = async () => {
        const [current, target] = await Promise.all([
          User.findById(currentUserId).select('role').lean(),
          User.findById(targetUserId).select('role').lean(),
        ])
        return classifyTransferState(
          (current?.role ?? null) as TransferRole,
          (target?.role ?? null) as TransferRole
        )
      }

      const state = await readState()
      if (state === 'transferred') {return}
      if (state === 'no_owner') {
        try {
          const restored = await User.updateOne(
            { _id: currentUserId, role: 'admin' },
            { $set: { role: 'super_admin', permissions: previousPermissions } }
          )
          if (restored.modifiedCount === 1) {throw error}
        } catch (restoreError) {
          if ((await readState()) === 'transferred') {return}
          throw restoreError
        }
      }
      if (state === 'original') {throw error}
      throw new Error('TRANSFER_STATE_UNCERTAIN')
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

/** PUT /api/users/me/account - update the signed-in administrator's account details. */
router.put('/me/account', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'not_authenticated' })
    }

    const user = await User.findById(req.user._id).select('+passwordHash')
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }
    if (user.provider !== 'email' || !user.passwordHash) {
      return res.status(400).json({ success: false, error: 'password_account_required' })
    }

    const nickname = req.body.nickname === undefined ? user.nickname : String(req.body.nickname).trim()
    const email = req.body.email === undefined ? user.email : String(req.body.email).trim().toLowerCase()
    const currentPassword = String(req.body.currentPassword || '')
    const newPassword = String(req.body.newPassword || '')
    const emailChanged = email !== (user.email ?? '')
    const passwordChanged = newPassword.length > 0

    if (!nickname) {
      return res.status(400).json({ success: false, error: 'nickname_required' })
    }
    if (!email || !EMAIL_SHAPE.test(email)) {
      return res.status(400).json({ success: false, error: 'invalid_email' })
    }
    if (passwordChanged && newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: 'password_too_short' })
    }
    if (user.mustChangeCredentials && !passwordChanged) {
      return res.status(400).json({ success: false, error: 'new_password_required' })
    }

    if (emailChanged || passwordChanged || user.mustChangeCredentials) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, error: 'current_password_required' })
      }
      if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
        return res.status(401).json({ success: false, error: 'current_password_incorrect' })
      }
    }

    if (emailChanged) {
      const duplicate = await User.exists({ _id: { $ne: user._id }, email })
      if (duplicate) {
        return res.status(409).json({ success: false, error: 'email_already_exists' })
      }
      user.email = email
      user.providerId = `email_${email}`
    }
    if (passwordChanged) {
      user.passwordHash = await bcrypt.hash(newPassword, 12)
    }
    user.nickname = nickname
    if (user.mustChangeCredentials && email && passwordChanged) {
      user.mustChangeCredentials = false
    }

    await user.save()
    return res.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email ?? null,
        loginUsername: user.loginUsername ?? null,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        provider: user.provider,
        permissions: user.permissions,
        isActive: user.isActive,
        mustChangeCredentials: user.mustChangeCredentials,
        lastLoginAt: user.lastLoginAt,
      },
    })
  } catch (error) {
    if (isDuplicateKeyOnField(error, 'email') || isDuplicateKeyOnField(error, 'providerId')) {
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }
    logger.error({ error }, 'Update own account failed')
    return res.status(500).json({ success: false, error: 'update_failed' })
  }
})

/** GET /api/users/me/profile - profile data for the shared account center. */
router.get('/me/profile', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  const user = await User.findById(req.user._id)
  if (!user) return res.status(404).json({ success: false, error: 'user_not_found' })
  return res.json({
    success: true,
    data: {
      id: String(user._id),
      email: user.email || '',
      nickname: user.nickname,
      avatar: user.avatar,
      createdAt: user.createdAt,
      provider: user.provider,
    },
  })
})

/** POST /api/users/me/profile/avatar - update the signed-in administrator's avatar. */
router.post('/me/profile/avatar', avatarUpload.single('avatar'), async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  if (!req.file) return res.status(400).json({ success: false, error: 'invalid_avatar' })
  try {
    const buffer = await sharp(req.file.buffer).rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const file = { ...req.file, buffer, size: buffer.length, mimetype: 'image/webp', originalname: `avatar-${String(req.user._id)}.webp` }
    const result = await uploadImageToOSS(file, { folder: 'uploads', fileName: `admins/${String(req.user._id)}-${Date.now()}.webp` })
    if (!result.success || !result.url) return res.status(400).json({ success: false, error: result.error || 'avatar_upload_failed' })
    await User.updateOne({ _id: req.user._id }, { $set: { avatar: result.url } })
    return res.json({ success: true, data: { avatar: result.url } })
  } catch (error) {
    logger.warn({ error, userId: req.user._id }, 'Update own avatar failed')
    return res.status(400).json({ success: false, error: 'invalid_avatar' })
  }
})

/** PUT /api/users/me/profile/password - change an email administrator's password. */
router.put('/me/profile/password', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  const currentPassword = String(req.body.currentPassword || '')
  const newPassword = String(req.body.newPassword || '')
  if (newPassword.length < MIN_PASSWORD_LENGTH || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ success: false, error: 'password_too_weak' })
  }
  const user = await User.findById(req.user._id).select('+passwordHash')
  if (!user) return res.status(404).json({ success: false, error: 'user_not_found' })
  if (user.provider !== 'email' || !user.passwordHash) return res.status(400).json({ success: false, error: 'password_account_required' })
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ success: false, error: 'current_password_invalid' })
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12)
  await user.save()
  return res.json({ success: true })
})

router.get('/me/favorites', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  const favorites = await AdminFavorite.find({ adminId: req.user._id }).sort({ createdAt: -1 }).lean()
  const documents = await BaseDocument.find({ _id: { $in: favorites.map(item => item.documentId) }, status: 'published' }).lean()
  const documentMap = new Map(documents.map((document: any) => [String(document._id), document]))
  const items = favorites.flatMap(favorite => {
    const document: any = documentMap.get(String(favorite.documentId))
    if (!document) return []
    return [{
      id: String(favorite._id),
      documentId: String(favorite.documentId),
      documentType: favorite.documentType,
      title: document.title,
      summary: document.summary || document.description || document.basicInfo?.introduction || '',
      updatedAt: document.updatedAt,
      createdAt: favorite.createdAt,
      url: favoriteUrl(favorite.documentType, document.slug || document._id),
    }]
  })
  return res.json({ success: true, data: items })
})

router.get('/me/favorites/status/:documentId', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  const favorite = mongoose.isValidObjectId(req.params.documentId)
    ? await AdminFavorite.exists({ adminId: req.user._id, documentId: req.params.documentId })
    : null
  return res.json({ success: true, data: { favorited: !!favorite } })
})

router.post('/me/favorites/:documentId', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  if (!mongoose.isValidObjectId(req.params.documentId)) return res.status(400).json({ success: false, error: 'invalid_document_id' })
  const document: any = await BaseDocument.findOne({ _id: req.params.documentId, status: 'published' }).select('documentType')
  if (!document) return res.status(404).json({ success: false, error: 'document_not_found' })
  await AdminFavorite.updateOne(
    { adminId: req.user._id, documentId: document._id },
    { $setOnInsert: { adminId: req.user._id, documentId: document._id, documentType: document.documentType } },
    { upsert: true },
  )
  return res.json({ success: true })
})

router.delete('/me/favorites/:documentId', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'not_authenticated' })
  await AdminFavorite.deleteOne({ adminId: req.user._id, documentId: req.params.documentId })
  return res.json({ success: true })
})

/** GET /api/users — all administrators can view the administrator directory. */
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

// All management routes below remain restricted to the super administrator.
router.use(requireSuperAdmin)

/** GET /api/users/invitations - list administrator invitations and delivery status */
router.get('/invitations', async (_req: Request, res: Response) => {
  try {
    const invitations = await AdminInvitation.find()
      .select('-tokenHash -__v')
      .populate('invitedBy', 'nickname email loginUsername')
      .sort({ createdAt: -1 })
      .limit(200)
    res.json({ success: true, data: invitations })
  } catch (error) {
    logger.error({ error }, 'Fetch admin invitations failed')
    res.status(500).json({ success: false, error: 'fetch_failed' })
  }
})

/** POST /api/users/invitations/:id/resend - issue a fresh token and resend an invitation */
router.post('/invitations/:id/resend', async (req: Request, res: Response) => {
  try {
    const invitation = await AdminInvitation.findById(req.params.id)
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'invitation_not_found' })
    }
    if (invitation.acceptedAt) {
      return res.status(409).json({ success: false, error: 'invitation_already_accepted' })
    }
    if (await User.exists({ email: invitation.email })) {
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }

    const token = crypto.randomBytes(32).toString('base64url')
    const inviteUrl = buildInviteUrl(token)
    await AdminInvitation.updateMany(
      { _id: { $ne: invitation._id }, email: invitation.email, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    )
    invitation.tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    invitation.expiresAt = new Date(Date.now() + INVITE_EXPIRES_MS)
    invitation.permissions = normalizePermissions(invitation.permissions)
    invitation.acceptedAt = null
    invitation.revokedAt = null
    invitation.deliveryStatus = 'pending'
    invitation.sendError = null
    await invitation.save()

    const emailResult = await emailVerificationService.sendAdminInvitation(
      invitation.email,
      inviteUrl,
      invitation.nickname
    )
    if (!emailResult.success) {
      invitation.revokedAt = new Date()
      invitation.deliveryStatus = 'failed'
      invitation.sendError = emailResult.error || 'send_failed'
      await invitation.save()
      return res.status(400).json({ success: false, error: invitation.sendError })
    }

    invitation.deliveryStatus = 'sent'
    await invitation.save()
    return res.json({ success: true, data: invitation })
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_URL_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, error: 'invite_url_not_configured' })
    }
    logger.error({ error, invitationId: req.params.id }, 'Resend admin invitation failed')
    return res.status(500).json({ success: false, error: 'resend_failed' })
  }
})

/** GET /api/users/permissions — return all available permissions */
router.get('/permissions', (_req: Request, res: Response) => {
  res.json({ success: true, data: ALL_PERMISSIONS })
})

/** POST /api/users/transfer-super-admin — atomically transfer ownership to an active admin */
router.post('/transfer-super-admin', async (req: Request, res: Response) => {
  let session: mongoose.ClientSession | undefined
  try {
    session = await mongoose.startSession()
    const activeSession = session
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
      await activeSession.withTransaction(async () => {
        const targetUser = await User.findOne({
          _id: targetUserId,
          role: 'admin',
          isActive: true,
          mustChangeCredentials: false,
        }).select('+passwordHash').session(activeSession)
        if (!targetUser?.passwordHash) {throw new Error('TARGET_NOT_ELIGIBLE')}

        const demoted = await User.updateOne(
          { _id: currentUser._id, role: 'super_admin', isActive: true },
          { $set: { role: 'admin', permissions: ALL_PERMISSIONS } },
          { session: activeSession }
        )
        if (demoted.modifiedCount !== 1) {throw new Error('SUPER_ADMIN_CHANGED')}

        targetUser.role = 'super_admin'
        targetUser.permissions = []
        await targetUser.save({ session: activeSession })
      })
    } catch (error) {
      if (!isTransactionUnsupported(error)) {throw error}
      logger.info('MongoDB transactions unavailable; using locked transfer fallback')
      await transferWithoutTransaction(currentUser._id, targetUserId, currentUser.permissions)
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
    if (error instanceof Error && error.message === 'TRANSFER_STATE_UNCERTAIN') {
      return res.status(503).json({ success: false, error: 'transfer_state_uncertain' })
    }
    logger.error({ error }, 'Transfer super admin failed')
    return res.status(500).json({ success: false, error: 'transfer_failed' })
  } finally {
    await session?.endSession()
  }
})

/** PUT /api/users/:id/password — super_admin resets an ordinary administrator's password. */
router.put('/:id/password', async (req: Request, res: Response) => {
  try {
    const newPassword = String(req.body.newPassword || '')
    if (
      newPassword.length < MIN_PASSWORD_LENGTH ||
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      return res.status(400).json({ success: false, error: 'password_too_weak' })
    }

    const user = await User.findById(req.params.id).select('+passwordHash')
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'cannot_modify_super_admin' })
    }
    if (user.provider !== 'email') {
      return res.status(400).json({ success: false, error: 'password_account_required' })
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12)
    user.mustChangeCredentials = false
    await user.save()

    const safeUser = user.toObject()
    delete (safeUser as { passwordHash?: string }).passwordHash
    return res.json({ success: true, data: safeUser })
  } catch (error) {
    logger.error({ error, userId: req.params.id }, 'Reset administrator password failed')
    return res.status(500).json({ success: false, error: 'password_reset_failed' })
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

    if (hasInvalidPermissions(permissions)) {
      return res.status(400).json({ success: false, error: 'invalid_permissions' })
    }

    const safePermissions = normalizePermissions(permissions)
    const token = crypto.randomBytes(32).toString('base64url')
    const inviteUrl = buildInviteUrl(token)

    await AdminInvitation.updateMany(
      { email: normalizedEmail, acceptedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    )

    const invitation = await AdminInvitation.create({
      email: normalizedEmail,
      nickname: nickname.trim(),
      permissions: safePermissions,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      invitedBy: req.user!._id,
      expiresAt: new Date(Date.now() + INVITE_EXPIRES_MS),
      deliveryStatus: 'pending',
      sendError: null,
    })

    const emailResult = await emailVerificationService.sendAdminInvitation(
      normalizedEmail,
      inviteUrl,
      invitation.nickname
    )
    if (!emailResult.success) {
      invitation.revokedAt = new Date()
      invitation.deliveryStatus = 'failed'
      invitation.sendError = emailResult.error || 'send_failed'
      await invitation.save()
      return res.status(400).json({ success: false, error: emailResult.error || 'send_failed' })
    }

    invitation.deliveryStatus = 'sent'
    invitation.sendError = null
    await invitation.save()

    res.status(201).json({ success: true, data: invitation })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'INVITE_URL_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, error: 'invite_url_not_configured' })
    }
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
