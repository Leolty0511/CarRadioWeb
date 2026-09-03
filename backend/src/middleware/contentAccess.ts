import { NextFunction, Request, Response } from 'express'
import User, { IUser } from '../models/User'
import Member, { IMember } from '../models/Member'
import { verifyAccessToken } from '../utils/jwt'
import { extractToken } from '../utils/tokenCookie'
import { getMemberToken } from '../utils/memberTokenCookie'
import { getClientIP } from '../services/geoLocationService'
import { parseMemberDevice } from '../utils/memberDevice'
import { hasValidGuideViewCookie } from '../utils/guideViewCookie'

declare global {
  namespace Express {
    interface Request {
      member?: IMember
      contentPrincipal?: { type: 'admin' | 'member'; id: string; nickname: string; avatar: string; roles: string[] }
    }
  }
}

async function resolveAdmin(req: Request): Promise<IUser | null> {
  const token = extractToken(req)
  if (!token) return null
  const payload = verifyAccessToken(token)
  if (!payload || !['admin', 'super_admin'].includes(payload.role)) return null
  return User.findOne({ _id: payload.userId, isActive: true })
}

async function resolveMember(req: Request): Promise<IMember | null> {
  const token = getMemberToken(req)
  if (!token) return null
  const payload = verifyAccessToken(token)
  if (!payload || payload.role !== 'member') return null
  const member = await Member.findOne({ _id: payload.userId, status: 'active' })
  if (member) touchMemberPresence(member, req)
  return member
}

export function getMemberPresence(req: Request) {
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 1000)
  const device = parseMemberDevice(userAgent)
  return {
    lastSeenAt: new Date(),
    lastSeenIp: getClientIP(req),
    lastSeenUserAgent: userAgent,
    lastSeenDeviceType: device.type,
    lastSeenOs: device.os,
    lastSeenBrowser: device.browser,
    lastSeenBrowserVersion: device.browserVersion,
  }
}

/** Throttle presence writes so normal browsing does not create a database write per request. */
export function touchMemberPresence(member: IMember, req: Request): void {
  const lastSeen = member.lastSeenAt ? new Date(member.lastSeenAt).getTime() : 0
  if (lastSeen && Date.now() - lastSeen < 60_000) return
  void Member.updateOne({ _id: member._id }, { $set: getMemberPresence(req) }).catch(() => undefined)
}

export async function optionalContentAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const admin = await resolveAdmin(req)
    if (admin) {
      req.user = admin
      req.contentPrincipal = { type: 'admin', id: String(admin._id), nickname: admin.nickname, avatar: admin.avatar, roles: [admin.role] }
      next()
      return
    }
    const member = await resolveMember(req)
    if (member) {
      req.member = member
      req.contentPrincipal = { type: 'member', id: String(member._id), nickname: member.nickname, avatar: member.avatar, roles: ['member'] }
    }
  } catch {
    // Optional access never blocks the request.
  }
  next()
}

export async function authenticateContentAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  await optionalContentAccess(req, res, () => undefined)
  if (!req.contentPrincipal) {
    res.status(401).json({ success: false, error: 'content_login_required' })
    return
  }
  next()
}

/** Member/admin login, or a signed cookie issued only after opening the QR /guide entry. */
export async function authenticateContentOrGuideView(req: Request, res: Response, next: NextFunction): Promise<void> {
  await optionalContentAccess(req, res, () => undefined)
  if (req.contentPrincipal || hasValidGuideViewCookie(req)) {
    next()
    return
  }
  res.status(401).json({ success: false, error: 'content_login_required' })
}

/** Member-only endpoints must never accept an administrator session. */
export async function authenticateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await resolveMember(req)
    if (!member) {
      res.status(401).json({ success: false, error: 'member_login_required' })
      return
    }
    req.member = member
    req.contentPrincipal = { type: 'member', id: String(member._id), nickname: member.nickname, avatar: member.avatar, roles: ['member'] }
    next()
  } catch {
    res.status(500).json({ success: false, error: 'member_auth_error' })
  }
}
