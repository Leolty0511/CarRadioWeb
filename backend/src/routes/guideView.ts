import { Router } from 'express'
import { createRateLimit } from '../middleware/errorHandler'
import { setGuideViewCookie } from '../utils/guideViewCookie'

const router = Router()
const guideViewRateLimit = createRateLimit(60 * 1000, 30, 'Too many requests')

/** Sets a signed viewer cookie so QR visitors can read manuals without a member login. */
router.get('/session', guideViewRateLimit, (_req, res) => {
  setGuideViewCookie(res)
  res.set('X-Robots-Tag', 'noindex, nofollow')
  res.json({ success: true })
})

export default router
