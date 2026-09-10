import express, { type NextFunction, type Request, type Response } from 'express'
import { notificationService } from '../services/notificationService'
import {
  formatForumEventNotification,
  parseForumEvent,
  reserveForumEvent,
  verifyForumEventSignature,
} from '../services/forumEventService'
import { createLogger } from '../utils/logger'

const router = express.Router()
const logger = createLogger('forum-events')
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 180
const MAX_RATE_BUCKETS = 1024
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

export function forumEventRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now()
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    if (!rateBuckets.has(key) && rateBuckets.size >= MAX_RATE_BUCKETS) {
      rateBuckets.delete(rateBuckets.keys().next().value || key)
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    next()
    return
  }
  if (bucket.count >= RATE_LIMIT) {
    res.status(429).json({ success: false, error: 'rate_limit_exceeded' })
    return
  }
  bucket.count += 1
  next()
}

router.post('/', async (req: Request, res: Response) => {
  const secret = String(process.env.FORUM_SSO_BRIDGE_SECRET || process.env.FORUM_OAUTH_CLIENT_SECRET || '')
  const timestamp = String(req.get('x-carradio-timestamp') || '')
  const signature = String(req.get('x-carradio-signature') || '')
  const encodedPayload = typeof req.body?.payload === 'string' ? req.body.payload : ''

  if (!verifyForumEventSignature(timestamp, encodedPayload, signature, secret)) {
    res.status(401).json({ success: false, error: 'invalid_signature' })
    return
  }

  try {
    const event = parseForumEvent(
      encodedPayload,
      process.env.FORUM_BASE_URL || process.env.FORUM_OAUTH_REDIRECT_URI,
    )
    if (!(await reserveForumEvent(event.eventId))) {
      res.status(202).json({ success: true, duplicate: true })
      return
    }

    res.status(202).json({ success: true })
    setImmediate(() => {
      void notificationService.notifyEvent('forumActivity', formatForumEventNotification(event)).catch((error) => {
        logger.error({ error, eventId: event.eventId }, 'Forum event notification failed')
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_payload'
    res.status(400).json({ success: false, error: message })
  }
})

export default router
