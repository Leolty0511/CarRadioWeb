import { NextFunction, Request, Response } from 'express'
import User, { IUser } from '../models/User'
import Member, { IMember } from '../models/Member'
import { verifyAccessToken } from '../utils/jwt'
import { extractToken } from '../utils/tokenCookie'
import { getMemberToken } from '../utils/memberTokenCookie'

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
  return Member.findOne({ _id: payload.userId, status: 'active' })
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
