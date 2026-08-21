import { Router } from 'express'
import Member from '../models/Member'

const router = Router()

router.get('/online', async (_req, res) => {
  const since = new Date(Date.now() - 5 * 60 * 1000)
  const items = await Member.find({ status: 'active', lastSeenAt: { $gte: since } })
    .select('nickname email avatar lastSeenAt lastSeenIp lastSeenDeviceType lastSeenOs lastSeenBrowser lastSeenBrowserVersion registrationCountry registrationRegion registrationCity')
    .sort({ lastSeenAt: -1 })
    .limit(200)
    .lean()
  res.json({ success: true, data: { count: items.length, since, items } })
})

router.get('/', async (req, res) => {
  await Member.updateMany({ status: { $in: ['pending', 'rejected'] } }, { $set: { status: 'active', reviewNote: '', approvedAt: new Date() } })
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
  const search = String(req.query.search || '').trim()
  const status = String(req.query.status || '')
  const filter: Record<string, unknown> = {}
  if (['active', 'suspended'].includes(status)) filter.status = status
  if (search) filter.$or = [
    { email: { $regex: search, $options: 'i' } },
    { nickname: { $regex: search, $options: 'i' } },
    { registrationIp: { $regex: search, $options: 'i' } },
  ]
  const onlineSince = new Date(Date.now() - 5 * 60 * 1000)
  const [items, total, allMembers, active, online] = await Promise.all([
    Member.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Member.countDocuments(filter),
    Member.countDocuments(),
    Member.countDocuments({ ...filter, status: 'active' }),
    Member.countDocuments({ ...filter, status: 'active', lastSeenAt: { $gte: onlineSince } }),
  ])
  const normalizedItems = items.map((item) => {
    const lastActivityAt = item.lastSeenAt || item.lastLoginAt || null
    const isOnline = item.status === 'active' && !!lastActivityAt && new Date(lastActivityAt).getTime() >= onlineSince.getTime()
    return { ...item, lastActivityAt, isOnline }
  })
  res.json({ success: true, data: {
    items: normalizedItems,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    stats: { total: allMembers, active, online },
  } })
})

router.put('/:id/status', async (req, res) => {
  const status = String(req.body.status || '')
  const reviewNote = String(req.body.reviewNote || '').trim()
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ success: false, error: 'invalid_status' })
  }
  const member = await Member.findByIdAndUpdate(req.params.id, {
    $set: {
      status,
      reviewNote,
      approvedAt: status === 'active' ? new Date() : null,
      approvedBy: status === 'active' ? req.user!._id : null,
    },
  }, { new: true })
  if (!member) return res.status(404).json({ success: false, error: 'member_not_found' })
  res.json({ success: true, data: member })
})

router.delete('/:id', async (req, res) => {
  const member = await Member.findByIdAndDelete(req.params.id)
  if (!member) return res.status(404).json({ success: false, error: 'member_not_found' })
  res.json({ success: true })
})

export default router
