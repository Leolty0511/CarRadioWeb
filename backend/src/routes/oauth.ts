/**
 * Authentication routes
 * Email verification + password login for internal management
 * OAuth removed - no external dependencies needed
 */

import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import User, { IUser } from '../models/User'
import AdminInvitation from '../models/AdminInvitation'
import { signTokenPair, verifyToken, verifyRefreshToken } from '../utils/jwt'
import { createSecureLogger } from '../utils/secureLogger'
import { adminJwtEmailField } from '../utils/adminIdentity'
import { setTokenCookie, clearTokenCookie, clearRefreshTokenCookie, extractToken, setRefreshTokenCookie } from '../utils/tokenCookie'
import { authLimiter, codeLimiter } from '../middleware/rateLimit'
import emailVerificationService from '../services/emailVerificationService'

const logger = createSecureLogger('auth-route')

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 10
const BOOTSTRAP_EMAIL_DOMAINS = new Set(['gmail.com', '163.com', '126.com'])

const router = Router()

async function needsBootstrapAdmin(): Promise<boolean> {
  const existingSuperAdmin = await User.exists({ role: 'super_admin' })
  return !existingSuperAdmin
}

function isAllowedBootstrapEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return !!domain && BOOTSTRAP_EMAIL_DOMAINS.has(domain)
}

function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'password_too_short'
  }
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  if (!hasUppercase || !hasLowercase || !hasNumber) {
    return 'password_too_weak'
  }
  return null
}

// 应用认证限流到登录相关路由
router.use('/login', authLimiter)
router.use('/register', authLimiter)
router.use('/send-code', codeLimiter)

router.get('/bootstrap-status', async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      needsBootstrap: await needsBootstrapAdmin(),
    })
  } catch (error) {
    logger.error({ error }, 'Bootstrap status check failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

router.get('/invitations/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '')
    if (token.length < 32) {
      return res.status(400).json({ success: false, error: 'invalid_invitation' })
    }

    const invitation = await AdminInvitation.findOne({
      tokenHash: hashInviteToken(token),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean()

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'invitation_not_found_or_expired' })
    }

    if (await User.exists({ email: invitation.email })) {
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }

    return res.json({
      success: true,
      invitation: {
        email: invitation.email,
        nickname: invitation.nickname,
        expiresAt: invitation.expiresAt,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Invitation lookup failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

router.post('/accept-invitation', async (req: Request, res: Response) => {
  let claimedInvitationId: unknown = null
  try {
    const token = String(req.body.token || '')
    const password = String(req.body.password || '')
    const nickname = String(req.body.nickname || '').trim()

    if (token.length < 32 || !password) {
      return res.status(400).json({ success: false, error: 'invitation_token_password_required' })
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError })
    }

    const acceptedAt = new Date()
    const invitation = await AdminInvitation.findOneAndUpdate(
      {
        tokenHash: hashInviteToken(token),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: acceptedAt },
      },
      { $set: { acceptedAt } },
      { new: true }
    )

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'invitation_not_found_or_expired' })
    }
    claimedInvitationId = invitation._id

    const existing = await User.findOne({ email: invitation.email })
    if (existing) {
      invitation.revokedAt = acceptedAt
      await invitation.save()
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await User.create({
      email: invitation.email,
      nickname: nickname || invitation.nickname,
      avatar: '',
      role: 'admin',
      provider: 'email',
      providerId: `email_${invitation.email}`,
      passwordHash,
      permissions: invitation.permissions,
      isActive: true,
      lastLoginAt: new Date(),
    })

    const tokens = signTokenPair({
      userId: user._id.toString(),
      email: adminJwtEmailField(user),
      role: user.role,
    })
    setTokenCookie(res, tokens.accessToken)
    setRefreshTokenCookie(res, tokens.refreshToken)

    logger.info({ userId: user._id, invitationId: invitation._id }, 'Invitation accepted')

    return res.status(201).json({ success: true })
  } catch (error: any) {
    if (error.code === 11000) {
      if (claimedInvitationId) {
        await AdminInvitation.findByIdAndUpdate(claimedInvitationId, { $set: { revokedAt: new Date() } })
      }
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }
    if (claimedInvitationId) {
      await AdminInvitation.findByIdAndUpdate(claimedInvitationId, { $set: { acceptedAt: null } })
    }
    logger.error({ error }, 'Accept invitation failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

// ═══════════════════════════════════════════════════════════════
// 邮箱验证码相关 API
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/auth/send-code — 发送验证码
 * 用于注册和忘记密码
 */
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const { email, type = 'register' } = req.body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'invalid_email' })
    }

    if (!['register', 'reset_password'].includes(type)) {
      return res.status(400).json({ success: false, error: 'invalid_type' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // 注册时检查邮箱是否已存在
    if (type === 'register') {
      if (!(await needsBootstrapAdmin())) {
        return res.status(403).json({ success: false, error: 'registration_closed' })
      }
      if (!isAllowedBootstrapEmail(normalizedEmail)) {
        return res.status(400).json({ success: false, error: 'unsupported_email_provider' })
      }
      const existing = await User.findOne({ email: normalizedEmail })
      if (existing) {
        return res.status(409).json({ success: false, error: 'email_already_exists' })
      }
    }

    // 忘记密码时检查邮箱是否存在
    if (type === 'reset_password') {
      const existing = await User.findOne({ email: normalizedEmail, provider: 'email' })
      if (!existing) {
        // 为了安全，不暴露邮箱是否存在
        return res.json({ success: true, message: '如果邮箱存在，验证码已发送' })
      }
    }

    const result = await emailVerificationService.sendCode(email, type)

    if (result.success) {
      // 获取邮箱服务商信息（用于前端提示）
      const providerInfo = emailVerificationService.getProviderInfo(email)
      return res.json({
        success: true,
        message: '验证码已发送',
        provider: providerInfo,
      })
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
        remainingMs: result.remainingMs,
      })
    }
  } catch (error) {
    logger.error({ error }, 'Send code failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

/**
 * POST /api/auth/verify-code — 验证验证码
 */
router.post('/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code, type = 'register' } = req.body

    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'email_and_code_required' })
    }

    const result = await emailVerificationService.verifyCode(email, code, type)

    if (result.success) {
      return res.json({ success: true, message: '验证成功' })
    } else {
      return res.status(400).json({ success: false, error: result.error })
    }
  } catch (error) {
    logger.error({ error }, 'Verify code failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

// ═══════════════════════════════════════════════════════════════
// 注册 API（需要先验证邮箱）
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/auth/register — 邮箱验证后注册
 * 流程：
 * 1. 前端先调用 /send-code 发送验证码
 * 2. 前端调用 /verify-code 验证
 * 3. 验证通过后，调用此接口完成注册
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, nickname } = req.body

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email_and_password_required' })
    }

    // 密码强度验证
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: 'password_too_short' })
    }

    // 密码复杂度验证
    const hasUppercase = /[A-Z]/.test(password)
    const hasLowercase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)

    if (!hasUppercase || !hasLowercase || !hasNumber) {
      return res.status(400).json({ success: false, error: 'password_too_weak' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // 检查邮箱是否已注册
    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }

    const isFirstUser = await needsBootstrapAdmin()
    if (!isFirstUser) {
      return res.status(403).json({ success: false, error: 'registration_closed' })
    }
    if (!isAllowedBootstrapEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'unsupported_email_provider' })
    }

    const isVerified = await emailVerificationService.isEmailVerified(normalizedEmail, 'register')
    if (!isVerified) {
      return res.status(400).json({ success: false, error: 'email_not_verified' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    try {
      const newUser = await User.create({
        email: normalizedEmail,
        nickname: nickname?.trim() || normalizedEmail.split('@')[0],
        avatar: '',
        role: isFirstUser ? 'super_admin' : 'admin',
        provider: 'email',
        providerId: `email_${normalizedEmail}`,
        passwordHash,
        permissions: [],
        isActive: isFirstUser, // 第一个用户自动激活，其他用户需要审批
        lastLoginAt: new Date(),
      })

      // 清除验证码记录
      await emailVerificationService.clearVerification(normalizedEmail, 'register')

      if (!newUser.isActive) {
        return res.status(403).json({
          success: false,
          error: 'account_pending_approval',
          message: '注册成功，等待管理员审批',
        })
      }

      // 第一个用户直接登录
      const tokens = signTokenPair({
        userId: newUser._id.toString(),
        email: adminJwtEmailField(newUser),
        role: newUser.role,
      })
      setTokenCookie(res, tokens.accessToken)
      setRefreshTokenCookie(res, tokens.refreshToken)

      logger.info({ userId: newUser._id, isFirstUser }, 'Registration successful')

      return res.status(201).json({
        success: true,
        user: {
          id: newUser._id,
          email: newUser.email,
          nickname: newUser.nickname,
          role: newUser.role,
        },
      })
    } catch (error: any) {
      if (error.code === 11000) {
        if (error.keyPattern?.role) {
          return res.status(403).json({ success: false, error: 'registration_closed' })
        }
        return res.status(409).json({ success: false, error: 'email_already_exists' })
      }

      throw error
    }
  } catch (error) {
    logger.error({ error }, 'Registration failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

// ═══════════════════════════════════════════════════════════════
// 登录 API
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/auth/login — 邮箱/用户名 + 密码登录
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const login = String(req.body.login ?? req.body.email ?? '').trim().toLowerCase()
    const password = req.body.password

    if (!login) {
      return res.status(400).json({ success: false, error: 'login_required' })
    }
    if (password == null || String(password).length === 0) {
      return res.status(400).json({ success: false, error: 'password_required' })
    }

    const user = await User.findOne({
      provider: 'email',
      $or: [{ email: String(login) }, { loginUsername: String(login) }],
    }).select('+passwordHash')

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, error: 'invalid_credentials' })
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'account_inactive' })
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'invalid_credentials' })
    }

    user.lastLoginAt = new Date()
    await user.save()

    const tokens = signTokenPair({
      userId: user._id.toString(),
      email: adminJwtEmailField(user),
      role: user.role,
    })
    setTokenCookie(res, tokens.accessToken)
    setRefreshTokenCookie(res, tokens.refreshToken)

    logger.info({ userId: user._id }, 'Login successful')

    return res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Login failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

// ═══════════════════════════════════════════════════════════════
// 忘记密码 API
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/auth/reset-password — 重置密码（需要验证码）
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, error: 'email_code_password_required' })
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: 'password_too_short' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // 验证验证码
    const isVerified = await emailVerificationService.isEmailVerified(normalizedEmail, 'reset_password')
    if (!isVerified) {
      return res.status(400).json({ success: false, error: 'email_not_verified' })
    }

    // 查找用户
    const user = await User.findOne({ email: normalizedEmail, provider: 'email' })
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }

    // 更新密码
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await user.save()

    // 清除验证码
    await emailVerificationService.clearVerification(normalizedEmail, 'reset_password')

    logger.info({ userId: user._id }, 'Password reset successful')

    return res.json({ success: true, message: '密码重置成功' })
  } catch (error) {
    logger.error({ error }, 'Reset password failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

// ═══════════════════════════════════════════════════════════════
// Token 管理 API
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/auth/change-password — 已登录用户修改密码
 */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req)
    if (!token) {
      return res.status(401).json({ success: false, error: 'missing_token' })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({ success: false, error: 'invalid_token' })
    }

    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'passwords_required' })
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: 'password_too_short' })
    }

    const user = await User.findById(payload.userId).select('+passwordHash')
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' })
    }

    if (user.provider !== 'email') {
      return res.status(400).json({ success: false, error: 'oauth_user_cannot_change_password' })
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash || '')
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'current_password_incorrect' })
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await user.save()

    return res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Change password failed')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

/**
 * POST /api/auth/logout — 登出
 */
router.post('/logout', (_req: Request, res: Response) => {
  clearTokenCookie(res)
  clearRefreshTokenCookie(res)
  res.json({ success: true })
})

/**
 * POST /api/auth/refresh — 刷新 Token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.['refresh_token']

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'refresh_token_missing' })
    }

    const payload = verifyRefreshToken(refreshToken)
    if (!payload) {
      clearTokenCookie(res)
      clearRefreshTokenCookie(res)
      return res.status(401).json({ success: false, error: 'refresh_token_invalid' })
    }

    const user = await User.findById(payload.userId)
    if (!user || !user.isActive) {
      clearTokenCookie(res)
      clearRefreshTokenCookie(res)
      return res.status(401).json({ success: false, error: 'user_inactive' })
    }

    const tokens = signTokenPair({
      userId: user._id.toString(),
      email: adminJwtEmailField(user),
      role: user.role,
    })

    setTokenCookie(res, tokens.accessToken)
    setRefreshTokenCookie(res, tokens.refreshToken)

    logger.info({ userId: user._id }, 'Token refresh successful')

    return res.json({
      success: true,
      expiresIn: tokens.expiresIn,
    })
  } catch (error) {
    logger.error({ error }, 'Token refresh failed')
    clearTokenCookie(res)
    clearRefreshTokenCookie(res)
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

/**
 * GET /api/auth/check — 检查登录状态
 */
router.get('/check', (req: Request, res: Response) => {
  const token = extractToken(req)
  if (!token) {
    return res.json({ authenticated: false })
  }

  const payload = verifyToken(token)
  if (!payload) {
    return res.json({ authenticated: false })
  }

  return res.json({ authenticated: true })
})

/**
 * GET /api/auth/me — 获取当前用户信息
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req)
    if (!token) {
      return res.status(401).json({ success: false, error: 'missing_token' })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({ success: false, error: 'invalid_token' })
    }

    const user = await User.findById(payload.userId).select('-__v')
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'user_not_found' })
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email ?? null,
        loginUsername: user.loginUsername ?? null,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        permissions: user.permissions,
        provider: user.provider,
        lastLoginAt: user.lastLoginAt,
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get current user')
    return res.status(500).json({ success: false, error: 'server_error' })
  }
})

export default router
