import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import Member from '../models/Member'
import User from '../models/User'
import MemberInvitation from '../models/MemberInvitation'
import { getMemberSettings } from '../models/MemberSettings'
import { signTokenPair, verifyAccessToken, verifyRefreshToken } from '../utils/jwt'
import { setTokenCookie, setRefreshTokenCookie, clearTokenCookie, clearRefreshTokenCookie } from '../utils/tokenCookie'
import { clearMemberTokenCookies, getMemberRefreshToken, getMemberToken, setMemberTokenCookies } from '../utils/memberTokenCookie'
import emailVerificationService from '../services/emailVerificationService'
import { getClientIP, getGeoLocationByIP } from '../services/geoLocationService'
import { authLimiter, codeLimiter } from '../middleware/rateLimit'
import { notificationService } from '../services/notificationService'
import { getMemberPresence, optionalContentAccess, touchMemberPresence } from '../middleware/contentAccess'
import { escapeMongoRegex } from '../utils/mongoRegex'
import { formatMemberDevice, parseMemberDevice } from '../utils/memberDevice'

const router = Router()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10
const hashCode = (code: string) => crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')

router.get('/settings', async (_req, res) => {
  const settings = await getMemberSettings()
  res.json({
    success: true,
    data: {
      registrationEnabled: settings.registrationEnabled,
      approvalRequired: settings.approvalRequired,
      invitationRequired: settings.invitationRequired,
    },
  })
})

router.get('/session', optionalContentAccess, async (req, res) => {
  if (!req.contentPrincipal) return res.json({ success: true, authenticated: false })
  res.json({ success: true, authenticated: true, data: req.contentPrincipal })
})

router.post('/send-code', codeLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const purpose = req.body.purpose === 'reset_password' ? 'reset_password' : 'register'
  if (!EMAIL.test(email)) return res.status(400).json({ success: false, error: 'invalid_email' })
  if (purpose === 'register') {
    const settings = await getMemberSettings()
    if (!settings.registrationEnabled) return res.status(403).json({ success: false, error: 'registration_closed' })
    if (await Member.exists({ email }) || await User.exists({ email })) {
      return res.status(409).json({ success: false, error: 'email_already_exists' })
    }
  }
  const result = await emailVerificationService.sendCode(email, purpose)
  res.status(result.success ? 200 : 400).json(result)
})

router.post('/register', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const nickname = String(req.body.nickname || '').trim()
  const password = String(req.body.password || '')
  const code = String(req.body.code || '').trim()
  const invitationCode = String(req.body.invitationCode || '').trim()
  if (!EMAIL.test(email) || !nickname || !code) return res.status(400).json({ success: false, error: 'invalid_registration_data' })
  if (password.length < MIN_PASSWORD || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ success: false, error: 'password_too_weak' })
  }
  const settings = await getMemberSettings()
  if (!settings.registrationEnabled) return res.status(403).json({ success: false, error: 'registration_closed' })
  if (await Member.exists({ email }) || await User.exists({ email })) {
    return res.status(409).json({ success: false, error: 'email_already_exists' })
  }
  const verified = await emailVerificationService.verifyCode(email, code, 'register')
  if (!verified.success) return res.status(400).json(verified)

  let invitationPrefix = ''
  let invitationId: unknown = null
  if (settings.invitationRequired) {
    if (!invitationCode) return res.status(400).json({ success: false, error: 'invitation_required' })
    const invitation = await MemberInvitation.findOne({
      codeHash: hashCode(invitationCode),
      enabled: true,
      $expr: { $lt: ['$usedCount', '$maxUses'] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
    if (!invitation) return res.status(400).json({ success: false, error: 'invitation_invalid' })
    invitationPrefix = invitation.prefix
    invitationId = invitation._id
  }

  const ip = getClientIP(req)
  const geo = await getGeoLocationByIP(ip)
  const status = settings.approvalRequired ? 'pending' : 'active'
  const presence = status === 'active' ? getMemberPresence(req) : {}
  const member = await Member.create({
    email,
    nickname,
    passwordHash: await bcrypt.hash(password, 12),
    status,
    registrationIp: ip,
    registrationCountry: geo?.country || '未知',
    registrationRegion: geo?.region || '未知',
    registrationCity: geo?.city || '未知',
    invitationPrefix,
    approvedAt: status === 'active' ? new Date() : null,
    ...(status === 'active' ? { lastLoginAt: new Date(), lastLoginIp: ip, ...presence } : {}),
  })
  if (invitationId) await MemberInvitation.updateOne({ _id: invitationId }, { $inc: { usedCount: 1 } })
  await emailVerificationService.clearVerification(email, 'register')

  if (status === 'active') {
    const device = parseMemberDevice(String(req.headers['user-agent'] || ''))
    notificationService.notifyAll({
      title: '新会员注册',
      content: [
        `会员：${nickname}`,
        `邮箱：${email}`,
        '状态：已激活',
        `地区：${[geo?.country, geo?.region, geo?.city].filter(Boolean).join(' / ') || '未知'}`,
        `IP：${ip}`,
        `设备：${formatMemberDevice(device)}`,
      ].join('\n'),
    }).catch(() => undefined)
  }

  if (status === 'pending') {
    notificationService.notifyAll({
      title: '新会员注册待审批',
      content: `${nickname} (${email})\n${geo?.city || '未知'}, ${geo?.country || '未知'}\nIP: ${ip}`,
    }).catch(() => undefined)
    return res.status(201).json({ success: true, pendingApproval: true })
  }

  const tokens = signTokenPair({ userId: String(member._id), email, role: 'member' })
  setMemberTokenCookies(res, tokens.accessToken, tokens.refreshToken)
  return res.status(201).json({ success: true, pendingApproval: false })
})

router.post('/login', authLimiter, async (req, res) => {
  const loginInput = String(req.body.login || req.body.email || '').trim()
  const login = loginInput.toLowerCase()
  const password = String(req.body.password || '')
  if (!login || !password) return res.status(400).json({ success: false, error: 'credentials_required' })

  const admin = await User.findOne({
    provider: 'email',
    $or: [
      { email: login },
      { loginUsername: login },
      { nickname: { $regex: new RegExp(`^${escapeMongoRegex(loginInput)}$`, 'i') } },
    ],
  }).select('+passwordHash')
  if (admin?.passwordHash && admin.isActive && await bcrypt.compare(password, admin.passwordHash)) {
    const tokens = signTokenPair({ userId: String(admin._id), email: admin.email || admin.loginUsername || '', role: admin.role })
    setTokenCookie(res, tokens.accessToken)
    setRefreshTokenCookie(res, tokens.refreshToken)
    clearMemberTokenCookies(res)
    return res.json({ success: true, data: { type: 'admin', nickname: admin.nickname } })
  }

  const member = await Member.findOne({ email: login }).select('+passwordHash')
  if (!member || !(await bcrypt.compare(password, member.passwordHash))) {
    return res.status(401).json({ success: false, error: 'invalid_credentials' })
  }
  if (member.status !== 'active') return res.status(403).json({ success: false, error: `account_${member.status}`, message: member.reviewNote })

  const ip = getClientIP(req)
  const geo = await getGeoLocationByIP(ip)
  member.lastLoginAt = new Date()
  member.lastLoginIp = ip
  Object.assign(member, getMemberPresence(req))
  member.loginHistory.push({
    ip,
    country: geo?.country || '未知',
    region: geo?.region || '未知',
    city: geo?.city || '未知',
    userAgent: String(req.headers['user-agent'] || ''),
    createdAt: new Date(),
  })
  if (member.loginHistory.length > 30) member.loginHistory = member.loginHistory.slice(-30)
  await member.save()
  const tokens = signTokenPair({ userId: String(member._id), email: member.email, role: 'member' })
  setMemberTokenCookies(res, tokens.accessToken, tokens.refreshToken)
  return res.json({ success: true, data: { type: 'member', nickname: member.nickname } })
})

router.post('/refresh', async (req, res) => {
  const token = getMemberRefreshToken(req)
  const payload = token ? verifyRefreshToken(token) : null
  if (!payload) return res.status(401).json({ success: false, error: 'invalid_refresh_token' })
  const member = await Member.findOne({ _id: payload.userId, status: 'active' })
  if (!member) return res.status(401).json({ success: false, error: 'member_inactive' })
  touchMemberPresence(member, req)
  const tokens = signTokenPair({ userId: String(member._id), email: member.email, role: 'member' })
  setMemberTokenCookies(res, tokens.accessToken, tokens.refreshToken)
  res.json({ success: true })
})

router.post('/reset-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const code = String(req.body.code || '')
  const password = String(req.body.password || '')
  if (password.length < MIN_PASSWORD || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ success: false, error: 'password_too_weak' })
  }
  const verified = await emailVerificationService.verifyCode(email, code, 'reset_password')
  if (!verified.success) return res.status(400).json(verified)
  const member = await Member.findOne({ email }).select('+passwordHash')
  if (!member) return res.status(400).json({ success: false, error: 'reset_failed' })
  member.passwordHash = await bcrypt.hash(password, 12)
  await member.save()
  await emailVerificationService.clearVerification(email, 'reset_password')
  res.json({ success: true })
})

router.post('/logout', async (req, res) => {
  const accessToken = getMemberToken(req)
  const payload = accessToken ? verifyAccessToken(accessToken) : null
  if (payload?.userId && payload.role === 'member') {
    await Member.updateOne({ _id: payload.userId }, { $set: { lastSeenAt: null } }).catch(() => undefined)
  }
  clearMemberTokenCookies(res)
  clearTokenCookie(res)
  clearRefreshTokenCookie(res)
  res.json({ success: true })
})

export default router
