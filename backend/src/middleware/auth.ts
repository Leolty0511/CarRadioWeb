/**
 * Authentication and authorization middleware
 * JWT-based, reads user from database on each request
 */

import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../utils/jwt'
import { extractToken } from '../utils/tokenCookie'
import User, { IUser } from '../models/User'
import logger from '../utils/logger'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: IUser
      resource?: unknown
    }
  }
}

/** Require a valid JWT (cookie or Authorization header) and active user */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractToken(req)
    if (!token) {
      res.status(401).json({ success: false, error: 'missing_token' })
      return
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      res.status(401).json({ success: false, error: 'invalid_token' })
      return
    }

    const user = await User.findById(payload.userId)
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'user_inactive' })
      return
    }

    req.user = user
    const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0
    if (!lastSeen || Date.now() - lastSeen >= 60_000) {
      void User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined)
    }
    next()
  } catch (error) {
    logger.error({ error }, 'authenticateUser failed')
    res.status(500).json({ success: false, error: 'auth_error' })
  }
}

/** Require specific permission(s) — super_admin always passes */
export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'not_authenticated' })
      return
    }

    const hasAll = permissions.every((p) => req.user!.hasPermission(p))
    if (!hasAll) {
      logger.warn({ userId: req.user._id, role: req.user.role, path: req.path, required: permissions, granted: req.user.permissions }, 'Permission denied')
      res.status(403).json({ success: false, error: 'insufficient_permissions' })
      return
    }

    next()
  }
}

/** Require at least one permission for shared admin resources. */
export const requireAnyPermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'not_authenticated' })
      return
    }

    if (!permissions.some((permission) => req.user!.hasPermission(permission))) {
      logger.warn({ userId: req.user._id, role: req.user.role, path: req.path, requiredAny: permissions, granted: req.user.permissions }, 'Permission denied')
      res.status(403).json({ success: false, error: 'insufficient_permissions' })
      return
    }

    next()
  }
}

/** Require super_admin role */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'not_authenticated' })
    return
  }

  if (req.user.role !== 'super_admin') {
    res.status(403).json({ success: false, error: 'super_admin_required' })
    return
  }

  next()
}

/** Optional auth — attach user if token present (cookie or header), but don't block */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req)
    if (token) {
      const payload = verifyAccessToken(token)
      if (payload) {
        const user = await User.findById(payload.userId)
        if (user?.isActive) {
          req.user = user
        }
      }
    }
  } catch (error) {
    // optionalAuth 不阻断请求，但仍记录异常以便排查 DB/JWT 故障
    logger.warn({ error }, 'optionalAuth encountered an error, continuing unauthenticated')
  }
  next()
}
