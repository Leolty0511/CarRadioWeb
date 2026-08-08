/**
 * CSRF Protection Middleware — Double Submit Cookie Pattern
 *
 * Strategy:
 * - Safe methods (GET, HEAD, OPTIONS): issue a new CSRF token cookie
 * - State-changing methods: validate X-CSRF-Token header against cookie
 *   ONLY for browser requests (Origin/Referer present). Non-browser clients
 *   (e.g. OAuth redirects from Google/GitHub) are skipped — they are
 *   protected by sameSite: 'lax' on the JWT cookie.
 *
 * The CSRF token cookie is NOT httpOnly so JavaScript can read it.
 * An attacker cannot set this cookie via XSS because the httpOnly JWT
 * cookie prevents the attacker from reading existing auth state.
 */

import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { setCsrfCookie, getCsrfTokenFromCookie } from '../utils/tokenCookie'
import { createLogger } from '../utils/logger'

const logger = createLogger('csrf')

const CSRF_HEADER = 'x-csrf-token'

/** Generate a cryptographically random CSRF token */
function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Safe methods that do not require CSRF validation */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Paths excluded from CSRF protection entirely */
const EXCLUDED_PATHS = new Set([
  '/health',
  '/',
])

/** Check if request looks like it came from a browser */
function isBrowserRequest(req: Request): boolean {
  const origin = req.headers.origin
  const referer = req.headers.referer
  // If there's an Origin or Referer, it's a browser making a cross-origin request
  if (origin || referer) return true
  // No Origin/Referer: could be a direct browser navigation or a non-browser client.
  // We still set the cookie for same-origin browser requests that omitted the header.
  // For non-browser clients (no cookies sent), CSRF check is skipped below anyway.
  return true
}

/**
 * CSRF middleware
 * - Safe methods: always issue a new token cookie
 * - Unsafe methods: validate only for browser requests with Origin/Referer
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (EXCLUDED_PATHS.has(req.path)) return next()

  // Safe method → always issue a new token
  if (SAFE_METHODS.has(req.method)) {
    // Keep the token stable while an admin page is open. Rotating it on every
    // GET can race with uploads and cause false missing/invalid token errors.
    if (!getCsrfTokenFromCookie(req)) {
      setCsrfCookie(res, generateCsrfToken())
    }
    return next()
  }

  // Unsafe method — check if this is a browser request with Origin/Referer
  const origin = req.headers.origin
  const referer = req.headers.referer
  const hasBrowserMarker = !!(origin || referer)

  if (!hasBrowserMarker) {
    // No Origin/Referer: likely a non-browser client (OAuth redirect, direct script, etc.)
    // sameSite: 'lax' already protects against most CSRF; skip token check here.
    return next()
  }

  const headerToken = req.headers[CSRF_HEADER] as string | undefined
  const cookieToken = getCsrfTokenFromCookie(req)

  if (!headerToken || !cookieToken) {
    logger.warn({ method: req.method, path: req.path, hasHeader: !!headerToken, hasCookie: !!cookieToken, ip: req.ip }, 'CSRF token missing')
    res.status(403).json({ success: false, error: 'csrf_token_missing' })
    return
  }

  // Constant-time comparison to prevent timing attacks
  if (headerToken.length !== cookieToken.length ||
      !crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))) {
    logger.warn({ method: req.method, path: req.path, ip: req.ip }, 'CSRF token invalid')
    res.status(403).json({ success: false, error: 'csrf_token_invalid' })
    return
  }

  // Keep the token stable for the lifetime of the cookie. Rotating it here
  // makes concurrent uploads race: the first request changes the cookie while
  // the remaining multipart requests still carry the previous header token.
  next()
}

/** CSRF header name constant for use in frontend */
export { CSRF_HEADER }
