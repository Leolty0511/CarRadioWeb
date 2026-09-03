import { createHmac, timingSafeEqual } from 'crypto'
import { CookieOptions, Request, Response } from 'express'
import { getDevSecret } from './jwtTokens'

export const GUIDE_VIEW_COOKIE = 'guide_view'
const GUIDE_VIEW_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const GUIDE_VIEW_PAYLOAD = 'guide-view-v1'

function getSigningSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret && secret.length >= 32) {return secret}
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return getDevSecret()
}

function signedGuideViewValue(): string {
  return createHmac('sha256', getSigningSecret()).update(GUIDE_VIEW_PAYLOAD).digest('hex')
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GUIDE_VIEW_MAX_AGE_MS,
    path: '/',
  }
}

export function setGuideViewCookie(res: Response): void {
  res.cookie(GUIDE_VIEW_COOKIE, signedGuideViewValue(), cookieOptions())
}

export function hasValidGuideViewCookie(req: Request): boolean {
  const value = req.cookies?.[GUIDE_VIEW_COOKIE]
  if (!value || typeof value !== 'string') {return false}
  const expected = signedGuideViewValue()
  const actual = Buffer.from(value)
  const target = Buffer.from(expected)
  if (actual.length !== target.length) {return false}
  return timingSafeEqual(actual, target)
}
