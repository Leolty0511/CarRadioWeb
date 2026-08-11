import { CookieOptions, Request, Response } from 'express'

const MEMBER_TOKEN = 'member_token'
const MEMBER_REFRESH_TOKEN = 'member_refresh_token'

function getSharedCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined
  const configured = String(
    process.env.AUTH_COOKIE_DOMAIN || process.env.FORUM_SSO_BRIDGE_COOKIE_DOMAIN || '',
  ).trim()
  if (configured) return configured.startsWith('.') ? configured : `.${configured}`

  try {
    const hostname = new URL(String(process.env.FRONTEND_URL || '')).hostname.toLowerCase()
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return undefined
    return `.${hostname.replace(/^www\./, '')}`
  } catch {
    return undefined
  }
}

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  ...(getSharedCookieDomain() ? { domain: getSharedCookieDomain() } : {}),
})

export function setMemberTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
  // Clear legacy host-only cookies before issuing the shared parent-domain pair.
  res.clearCookie(MEMBER_TOKEN, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
  res.clearCookie(MEMBER_REFRESH_TOKEN, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/member-auth' })
  res.cookie(MEMBER_TOKEN, accessToken, { ...baseOptions(), path: '/', maxAge: 60 * 60 * 1000 })
  res.cookie(MEMBER_REFRESH_TOKEN, refreshToken, {
    ...baseOptions(),
    path: '/api/member-auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearMemberTokenCookies(res: Response): void {
  res.clearCookie(MEMBER_TOKEN, { ...baseOptions(), path: '/' })
  res.clearCookie(MEMBER_REFRESH_TOKEN, { ...baseOptions(), path: '/api/member-auth' })
}

export function getMemberToken(req: Request): string | undefined {
  return req.cookies?.[MEMBER_TOKEN]
}

export function getMemberRefreshToken(req: Request): string | undefined {
  return req.cookies?.[MEMBER_REFRESH_TOKEN]
}
