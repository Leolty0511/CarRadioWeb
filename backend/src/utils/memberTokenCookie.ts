import { CookieOptions, Request, Response } from 'express'

const MEMBER_TOKEN = 'member_token'
const MEMBER_REFRESH_TOKEN = 'member_refresh_token'

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
})

export function setMemberTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
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
