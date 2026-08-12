import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import mongoose from 'mongoose'
import multer from 'multer'
import sharp from 'sharp'
import Member from '../models/Member'
import User from '../models/User'
import MemberFavorite from '../models/MemberFavorite'
import ForumOAuthAuthorizationCode from '../models/ForumOAuthAuthorizationCode'
import ForumOAuthAccessToken from '../models/ForumOAuthAccessToken'
import ForumBridgeNonce from '../models/ForumBridgeNonce'
import BaseDocument from '../models/Document'
import { signTokenPair, verifyAccessToken, verifyRefreshToken } from '../utils/jwt'
import { clearTokenCookie, clearRefreshTokenCookie } from '../utils/tokenCookie'
import { clearMemberTokenCookies, getMemberRefreshToken, getMemberToken, setMemberTokenCookies } from '../utils/memberTokenCookie'
import emailVerificationService from '../services/emailVerificationService'
import { getClientIP, getGeoLocationByIP } from '../services/geoLocationService'
import { authLimiter, codeLimiter } from '../middleware/rateLimit'
import { notificationService } from '../services/notificationService'
import { authenticateMember, getMemberPresence, optionalContentAccess, touchMemberPresence } from '../middleware/contentAccess'
import { formatMemberDevice, parseMemberDevice } from '../utils/memberDevice'
import { uploadImageToOSS } from '../services/uploadService'
import { getForumMemberSummary } from '../services/forumService'

const router = Router()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 10
const OAUTH_CODE_TTL_MS = 2 * 60 * 1000
const OAUTH_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000
const FORUM_BRIDGE_COOKIE = 'carradioweb_forum_bridge'
const FORUM_BRIDGE_MAX_TTL_SECONDS = 5 * 60
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
})

function validPassword(password: string) {
  return password.length >= MIN_PASSWORD && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
}

function getForumBaseUrl(): string {
  const configured = process.env.FORUM_BASE_URL || process.env.FLARUM_BASE_URL
  if (configured) return configured.replace(/\/$/, '')

  const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_APP_URL || ''
  try {
    const url = new URL(frontendUrl)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return 'http://localhost:8888'
    // The public site may be served from either the apex domain or www. Keep
    // the forum host stable so OAuth redirect URIs do not change by hostname.
    return `${url.protocol}//forum.${url.hostname.replace(/^www\./i, '')}`
  } catch {
    return ''
  }
}

function getForumOAuthConfig() {
  const forumBaseUrl = getForumBaseUrl()
  const clientId = process.env.FORUM_OAUTH_CLIENT_ID || 'carradioweb-forum'
  const clientSecret = process.env.FORUM_OAUTH_CLIENT_SECRET || ''
  const redirectUri = (process.env.FORUM_OAUTH_REDIRECT_URI || `${forumBaseUrl}/auth/passport`).replace(/\/$/, '')
  return { forumBaseUrl, clientId, clientSecret, redirectUri }
}

function isConfiguredOAuth(config: ReturnType<typeof getForumOAuthConfig>): boolean {
  return Boolean(config.forumBaseUrl && config.clientId && config.clientSecret.length >= 32 && config.redirectUri)
}

function sameSecret(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

function hashOAuthToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

interface ForumBridgeClaims {
  forum_user_id: string
  email: string
  username: string
  avatar_url?: string
  nonce: string
  iat: number
  exp: number
}

function getForumBridgeSecret(): string {
  return String(process.env.FORUM_SSO_BRIDGE_SECRET || process.env.FORUM_OAUTH_CLIENT_SECRET || '').trim()
}

function getForumBridgeCookieDomain(): string | undefined {
  const configured = String(process.env.FORUM_SSO_BRIDGE_COOKIE_DOMAIN || '').trim()
  if (configured) {
    const normalized = configured.replace(/^\.+/, '').replace(/^www\./i, '')
    return normalized ? `.${normalized}` : undefined
  }
  const frontendUrl = String(process.env.FRONTEND_URL || process.env.VITE_APP_URL || '').trim()
  try {
    const hostname = new URL(frontendUrl).hostname.toLowerCase()
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return undefined
    const parts = hostname.split('.').filter(Boolean)
    return parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : undefined
  } catch {
    return undefined
  }
}

function clearForumBridgeCookie(res: any): void {
  res.clearCookie(FORUM_BRIDGE_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(getForumBridgeCookieDomain() ? { domain: getForumBridgeCookieDomain() } : {}),
  })
}

function decodeForumBridgeClaims(value: string): ForumBridgeClaims | null {
  const secret = getForumBridgeSecret()
  const separator = value.lastIndexOf('.')
  if (secret.length < 32 || separator <= 0) return null
  const encoded = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  if (!sameSecret(signature, expected)) return null
  try {
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ForumBridgeClaims
    const now = Math.floor(Date.now() / 1000)
    if (!claims || !EMAIL.test(String(claims.email || '').toLowerCase())) return null
    if (!claims.forum_user_id || !claims.nonce || claims.nonce.length < 16) return null
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null
    if (claims.iat > now + 30 || claims.exp <= now || claims.exp - claims.iat > FORUM_BRIDGE_MAX_TTL_SECONDS) return null
    return claims
  } catch {
    return null
  }
}

async function exchangeForumBridge(req: any, res: any) {
  const raw = String(req.cookies?.[FORUM_BRIDGE_COOKIE] || '')
  if (!raw) return null
  clearForumBridgeCookie(res)
  const claims = decodeForumBridgeClaims(raw)
  if (!claims) return null

  const email = claims.email.trim().toLowerCase()
  if (await blockedForumMember(email)) return null
  try {
    await ForumBridgeNonce.create({
      nonceHash: hashOAuthToken(claims.nonce),
      forumUserId: claims.forum_user_id,
      usedAt: new Date(),
      expiresAt: new Date((claims.exp + FORUM_BRIDGE_MAX_TTL_SECONDS) * 1000),
    })
  } catch (error: any) {
    if (error?.code === 11000) return null
    throw error
  }

  const memberByForumId = await Member.findOne({ forumUserId: claims.forum_user_id }).select('+passwordHash')
  const memberByEmail = await Member.findOne({ email }).select('+passwordHash')
  if (memberByForumId && memberByEmail && String(memberByForumId._id) !== String(memberByEmail._id)) return null
  let member = memberByForumId || memberByEmail
  if (member?.forumUserId && member.forumUserId !== claims.forum_user_id) return null
  if (member?.status === 'suspended') return null

  const ip = getClientIP(req)
  const geo = await getGeoLocationByIP(ip)
  const nickname = String(claims.username || email.split('@')[0] || 'Member').trim().slice(0, 50)
  if (!member) {
    member = await Member.create({
      forumUserId: claims.forum_user_id,
      email,
      nickname: nickname || 'Member',
      avatar: String(claims.avatar_url || '').slice(0, 2000),
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12),
      status: 'active',
      registrationIp: ip,
      registrationCountry: geo?.country || '未知',
      registrationRegion: geo?.region || '未知',
      registrationCity: geo?.city || '未知',
      approvedAt: new Date(),
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      ...getMemberPresence(req),
    })
  } else {
    member.forumUserId = claims.forum_user_id
    member.status = 'active'
    member.nickname = nickname || member.nickname
    if (claims.avatar_url) member.avatar = String(claims.avatar_url).slice(0, 2000)
    member.lastLoginAt = new Date()
    member.lastLoginIp = ip
    Object.assign(member, getMemberPresence(req))
    await member.save()
  }

  const tokens = signTokenPair({ userId: String(member._id), email: member.email, role: 'member' })
  setMemberTokenCookies(res, tokens.accessToken, tokens.refreshToken)
  return { type: 'member' as const, id: String(member._id), nickname: member.nickname, avatar: member.avatar, roles: ['member'] }
}

function blockedForumEmail(email: string): boolean {
  const blocked = String(process.env.FORUM_SSO_BLOCKED_EMAILS || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  return blocked.includes(email.toLowerCase())
}

async function blockedForumMember(email: string): Promise<boolean> {
  if (blockedForumEmail(email)) return true
  return Boolean(await User.exists({ email: email.toLowerCase(), role: { $in: ['admin', 'super_admin'] } }))
}

function frontendLoginUrl(): string {
  const base = process.env.FRONTEND_URL || process.env.VITE_APP_URL || ''
  return base ? `${base.replace(/\/$/, '')}/login?returnTo=/forum` : '/login?returnTo=/forum'
}

function oauthError(res: any, redirectUri: string, state: string, error: string, description?: string) {
  const target = new URL(redirectUri)
  target.searchParams.set('error', error)
  if (description) target.searchParams.set('error_description', description)
  if (state) target.searchParams.set('state', state)
  return res.redirect(target.toString())
}

function readBasicClient(req: any): { clientId: string; clientSecret: string } {
  const header = String(req.headers.authorization || '')
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
      const separator = decoded.indexOf(':')
      if (separator >= 0) return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) }
    } catch {
      // Fall through to the form fields.
    }
  }
  return { clientId: String(req.body?.client_id || ''), clientSecret: String(req.body?.client_secret || '') }
}

router.get('/session', optionalContentAccess, async (req, res) => {
  if (req.contentPrincipal) return res.json({ success: true, authenticated: true, data: req.contentPrincipal })
  try {
    const principal = await exchangeForumBridge(req, res)
    if (principal) return res.json({ success: true, authenticated: true, data: principal })
  } catch {
    clearForumBridgeCookie(res)
  }
  return res.json({ success: true, authenticated: false })
})

/** OAuth 2.0 authorization endpoint consumed by Flarum FoF Passport. */
router.get('/forum/oauth/authorize', async (req, res) => {
  const config = getForumOAuthConfig()
  const clientId = String(req.query.client_id || '')
  const redirectUri = String(req.query.redirect_uri || '')
  const responseType = String(req.query.response_type || '')
  const state = String(req.query.state || '')
  const scope = String(req.query.scope || '')

  if (!isConfiguredOAuth(config)) return res.status(503).json({ success: false, error: 'forum_oauth_not_configured' })
  if (clientId !== config.clientId || responseType !== 'code' || redirectUri !== config.redirectUri) {
    return res.status(400).json({ success: false, error: 'invalid_request' })
  }
  if (scope && scope.split(/\s+/).some(item => item !== 'read')) {
    return oauthError(res, redirectUri, state, 'invalid_scope')
  }

  await optionalContentAccess(req, res, () => undefined)
  const member = req.contentPrincipal?.type === 'member' ? req.member : null
  if (!member) return res.redirect(frontendLoginUrl())
  if (await blockedForumMember(member.email)) return oauthError(res, redirectUri, state, 'access_denied', 'This account is reserved for a forum administrator.')

  const code = crypto.randomBytes(32).toString('base64url')
  await ForumOAuthAuthorizationCode.create({
    codeHash: hashOAuthToken(code),
    memberId: member._id,
    clientId,
    redirectUri,
    expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
  })

  const target = new URL(redirectUri)
  target.searchParams.set('code', code)
  if (state) target.searchParams.set('state', state)
  res.redirect(target.toString())
})

/** OAuth 2.0 token endpoint. Flarum calls this server-to-server. */
router.post('/forum/oauth/token', async (req, res) => {
  const config = getForumOAuthConfig()
  const { clientId, clientSecret } = readBasicClient(req)
  const grantType = String(req.body?.grant_type || '')
  const code = String(req.body?.code || '')
  const redirectUri = String(req.body?.redirect_uri || '')
  if (!isConfiguredOAuth(config)) return res.status(503).json({ error: 'server_error' })
  if (clientId !== config.clientId || !sameSecret(clientSecret, config.clientSecret)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CarRadioWeb OAuth"')
    return res.status(401).json({ error: 'invalid_client' })
  }
  if (grantType !== 'authorization_code' || !code || redirectUri !== config.redirectUri) {
    return res.status(400).json({ error: 'invalid_grant' })
  }

  const record = await ForumOAuthAuthorizationCode.findOneAndUpdate(
    { codeHash: hashOAuthToken(code), clientId, redirectUri, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  )
  if (!record) return res.status(400).json({ error: 'invalid_grant' })

  const member = await Member.findOne({ _id: record.memberId, status: 'active' }).select('email nickname avatar')
  if (!member || await blockedForumMember(member.email)) return res.status(400).json({ error: 'invalid_grant' })

  const accessToken = crypto.randomBytes(32).toString('base64url')
  await ForumOAuthAccessToken.create({
    tokenHash: hashOAuthToken(accessToken),
    memberId: member._id,
    clientId,
    expiresAt: new Date(Date.now() + OAUTH_ACCESS_TOKEN_TTL_MS),
  })
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: Math.floor(OAUTH_ACCESS_TOKEN_TTL_MS / 1000) })
})

/** OAuth 2.0 resource endpoint consumed by FoF Passport. */
router.get('/forum/oauth/user', async (req, res) => {
  const config = getForumOAuthConfig()
  const authorization = String(req.headers.authorization || '')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!isConfiguredOAuth(config) || !match?.[1]) return res.status(401).json({ error: 'invalid_token' })

  const token = await ForumOAuthAccessToken.findOne({ tokenHash: hashOAuthToken(match[1]), clientId: config.clientId, expiresAt: { $gt: new Date() } })
  if (!token) return res.status(401).json({ error: 'invalid_token' })
  const member = await Member.findOne({ _id: token.memberId, status: 'active' }).select('email nickname avatar')
  if (!member || await blockedForumMember(member.email)) return res.status(401).json({ error: 'invalid_token' })
  res.json({ id: String(member._id), email: member.email, name: member.nickname, nickname: member.nickname, avatar: member.avatar || '' })
})

router.post('/send-code', codeLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const purpose = req.body.purpose === 'reset_password' ? 'reset_password' : 'register'
  if (!EMAIL.test(email)) return res.status(400).json({ success: false, error: 'invalid_email' })
  if (purpose === 'register' && (await Member.exists({ email }) || await User.exists({ email }))) {
    return res.status(409).json({ success: false, error: 'email_already_exists' })
  }
  const result = await emailVerificationService.sendCode(email, purpose)
  res.status(result.success ? 200 : 400).json(result)
})

router.post('/register', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const nickname = String(req.body.nickname || '').trim()
  const password = String(req.body.password || '')
  const code = String(req.body.code || '').trim()
  if (!EMAIL.test(email) || !nickname || !code) return res.status(400).json({ success: false, error: 'invalid_registration_data' })
  if (!validPassword(password)) return res.status(400).json({ success: false, error: 'password_too_weak' })
  if (await Member.exists({ email }) || await User.exists({ email })) return res.status(409).json({ success: false, error: 'email_already_exists' })
  const verified = await emailVerificationService.verifyCode(email, code, 'register')
  if (!verified.success) return res.status(400).json(verified)

  const ip = getClientIP(req)
  const geo = await getGeoLocationByIP(ip)
  const member = await Member.create({
    email,
    nickname,
    passwordHash: await bcrypt.hash(password, 12),
    status: 'active',
    registrationIp: ip,
    registrationCountry: geo?.country || '未知',
    registrationRegion: geo?.region || '未知',
    registrationCity: geo?.city || '未知',
    invitationPrefix: '',
    approvedAt: new Date(),
    lastLoginAt: new Date(),
    lastLoginIp: ip,
    ...getMemberPresence(req),
  })
  await emailVerificationService.clearVerification(email, 'register')
  const device = parseMemberDevice(String(req.headers['user-agent'] || ''))
  notificationService.notifyEvent('memberRegistration', {
    title: '新会员注册',
    content: [`会员：${nickname}`, `邮箱：${email}`, `地区：${[geo?.country, geo?.region, geo?.city].filter(Boolean).join(' / ') || '未知'}`, `IP：${ip}`, `设备：${formatMemberDevice(device)}`].join('\n'),
  }).catch(() => undefined)
  const tokens = signTokenPair({ userId: String(member._id), email, role: 'member' })
  setMemberTokenCookies(res, tokens.accessToken, tokens.refreshToken)
  return res.status(201).json({ success: true })
})

router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body.login || req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  if (!email || !password) return res.status(400).json({ success: false, error: 'credentials_required' })
  const member = await Member.findOne({ email }).select('+passwordHash')
  if (!member || !(await bcrypt.compare(password, member.passwordHash))) return res.status(401).json({ success: false, error: 'invalid_credentials' })
  if (member.status === 'pending' || member.status === 'rejected') {
    member.status = 'active'
    member.reviewNote = ''
    member.approvedAt = member.approvedAt || new Date()
    await member.save()
  }
  if (member.status !== 'active') return res.status(403).json({ success: false, error: `account_${member.status}`, message: member.reviewNote })
  const ip = getClientIP(req)
  const geo = await getGeoLocationByIP(ip)
  member.lastLoginAt = new Date()
  member.lastLoginIp = ip
  Object.assign(member, getMemberPresence(req))
  member.loginHistory.push({ ip, country: geo?.country || '未知', region: geo?.region || '未知', city: geo?.city || '未知', userAgent: String(req.headers['user-agent'] || ''), createdAt: new Date() })
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
  const member = await Member.findOne({ _id: payload.userId, status: { $in: ['active', 'pending', 'rejected'] } })
  if (!member) return res.status(401).json({ success: false, error: 'member_inactive' })
  if (member.status === 'pending' || member.status === 'rejected') {
    member.status = 'active'
    member.reviewNote = ''
    member.approvedAt = member.approvedAt || new Date()
    await member.save()
  }
  touchMemberPresence(member, req)
  const tokens = signTokenPair({ userId: String(member._id), email: member.email, role: 'member' })
  setMemberTokenCookies(res, tokens.accessToken, tokens.refreshToken)
  res.json({ success: true })
})

router.post('/reset-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const code = String(req.body.code || '')
  const password = String(req.body.password || '')
  if (!validPassword(password)) return res.status(400).json({ success: false, error: 'password_too_weak' })
  const verified = await emailVerificationService.verifyCode(email, code, 'reset_password')
  if (!verified.success) return res.status(400).json(verified)
  const member = await Member.findOne({ email }).select('+passwordHash')
  if (!member) return res.status(400).json({ success: false, error: 'reset_failed' })
  member.passwordHash = await bcrypt.hash(password, 12)
  await member.save()
  await emailVerificationService.clearVerification(email, 'reset_password')
  res.json({ success: true })
})

router.get('/profile', authenticateMember, async (req, res) => {
  const member = req.member!
  res.json({ success: true, data: { id: String(member._id), email: member.email, nickname: member.nickname, avatar: member.avatar, createdAt: member.createdAt } })
})

router.get('/forum-summary', authenticateMember, async (req, res) => {
  const summary = await getForumMemberSummary(req.member?.forumUserId)
  res.json({ success: true, data: summary })
})

router.put('/profile', authenticateMember, async (req, res) => {
  const nickname = String(req.body.nickname || '').trim()
  if (nickname.length < 2 || nickname.length > 50) return res.status(400).json({ success: false, error: 'invalid_nickname' })
  const member = await Member.findByIdAndUpdate(req.member!._id, { $set: { nickname } }, { new: true, runValidators: true })
  res.json({ success: true, data: { id: String(member!._id), email: member!.email, nickname: member!.nickname, avatar: member!.avatar } })
})

router.post('/profile/avatar', authenticateMember, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'invalid_avatar' })
  try {
    const buffer = await sharp(req.file.buffer).rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const file = { ...req.file, buffer, size: buffer.length, mimetype: 'image/webp', originalname: `avatar-${String(req.member!._id)}.webp` }
    const result = await uploadImageToOSS(file, { folder: 'uploads', fileName: `members/${String(req.member!._id)}-${Date.now()}.webp` })
    if (!result.success || !result.url) return res.status(400).json({ success: false, error: result.error || 'avatar_upload_failed' })
    await Member.updateOne({ _id: req.member!._id }, { $set: { avatar: result.url } })
    res.json({ success: true, data: { avatar: result.url } })
  } catch {
    res.status(400).json({ success: false, error: 'invalid_avatar' })
  }
})

router.put('/profile/password', authenticateMember, authLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '')
  const newPassword = String(req.body.newPassword || '')
  if (!validPassword(newPassword)) return res.status(400).json({ success: false, error: 'password_too_weak' })
  const member = await Member.findById(req.member!._id).select('+passwordHash')
  if (!member || !(await bcrypt.compare(currentPassword, member.passwordHash))) return res.status(400).json({ success: false, error: 'current_password_invalid' })
  member.passwordHash = await bcrypt.hash(newPassword, 12)
  await member.save()
  res.json({ success: true })
})

router.get('/favorites', authenticateMember, async (req, res) => {
  const favorites = await MemberFavorite.find({ memberId: req.member!._id }).sort({ createdAt: -1 }).lean()
  const documents = await BaseDocument.find({ _id: { $in: favorites.map(item => item.documentId) }, status: 'published' }).lean()
  const documentMap = new Map(documents.map((document: any) => [String(document._id), document]))
  const items = favorites.flatMap(favorite => {
    const document: any = documentMap.get(String(favorite.documentId))
    if (!document) return []
    const routeType = favorite.documentType === 'structured' ? 'vehicle' : favorite.documentType === 'video' ? 'video' : 'article'
    return [{ id: String(favorite._id), documentId: String(favorite.documentId), documentType: favorite.documentType, title: document.title, summary: document.summary || document.description || document.basicInfo?.introduction || '', updatedAt: document.updatedAt, createdAt: favorite.createdAt, url: `/knowledge/${routeType}/${document.slug || document._id}` }]
  })
  res.json({ success: true, data: items })
})

router.get('/favorites/status/:documentId', authenticateMember, async (req, res) => {
  const favorite = mongoose.isValidObjectId(req.params.documentId) ? await MemberFavorite.exists({ memberId: req.member!._id, documentId: req.params.documentId }) : null
  res.json({ success: true, data: { favorited: !!favorite } })
})

router.post('/favorites/:documentId', authenticateMember, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.documentId)) return res.status(400).json({ success: false, error: 'invalid_document_id' })
  const document: any = await BaseDocument.findOne({ _id: req.params.documentId, status: 'published' }).select('documentType')
  if (!document) return res.status(404).json({ success: false, error: 'document_not_found' })
  await MemberFavorite.updateOne({ memberId: req.member!._id, documentId: document._id }, { $setOnInsert: { memberId: req.member!._id, documentId: document._id, documentType: document.documentType } }, { upsert: true })
  res.json({ success: true })
})

router.delete('/favorites/:documentId', authenticateMember, async (req, res) => {
  await MemberFavorite.deleteOne({ memberId: req.member!._id, documentId: req.params.documentId })
  res.json({ success: true })
})

router.post('/logout', async (req, res) => {
  const accessToken = getMemberToken(req)
  const payload = accessToken ? verifyAccessToken(accessToken) : null
  if (payload?.userId && payload.role === 'member') await Member.updateOne({ _id: payload.userId }, { $set: { lastSeenAt: null } }).catch(() => undefined)
  clearMemberTokenCookies(res)
  clearTokenCookie(res)
  clearRefreshTokenCookie(res)
  clearForumBridgeCookie(res)
  res.json({ success: true })
})

export default router
