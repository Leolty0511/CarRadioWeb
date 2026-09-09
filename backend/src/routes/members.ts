import { Router } from 'express'
import Member from '../models/Member'
import MemberVehicle from '../models/MemberVehicle'

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
  const onlineSince = new Date(Date.now() - 5 * 60 * 1000)
  if (status === 'suspended') {
    filter.status = 'suspended'
  } else if (status === 'online') {
    filter.status = 'active'
    filter.lastSeenAt = { $gte: onlineSince }
  } else if (status === 'offline') {
    filter.status = 'active'
    filter.$and = [{
      $or: [
        { lastSeenAt: { $exists: false } },
        { lastSeenAt: null },
        { lastSeenAt: { $lt: onlineSince } },
      ]
    }]
  } else if (status === 'active') {
    filter.status = 'active'
  }
  if (search) filter.$or = [
    { email: { $regex: search, $options: 'i' } },
    { nickname: { $regex: search, $options: 'i' } },
    { registrationIp: { $regex: search, $options: 'i' } },
  ]
  const [items, total, allMembers, active, online] = await Promise.all([
    Member.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Member.countDocuments(filter),
    Member.countDocuments(),
    Member.countDocuments({ ...filter, status: 'active' }),
    Member.countDocuments({ ...filter, status: 'active', lastSeenAt: { $gte: onlineSince } }),
  ])
  const vehicles = items.length > 0
    ? await MemberVehicle.find({ memberId: { $in: items.map(item => item._id) } })
      .select('memberId vehicleId brand modelName yearRange generation nickname isDefault forumVisibility createdAt')
      .sort({ isDefault: -1, createdAt: 1 })
      .lean()
    : []
  const vehiclesByMember = new Map<string, typeof vehicles>()
  for (const vehicle of vehicles) {
    const memberId = String(vehicle.memberId)
    vehiclesByMember.set(memberId, [...(vehiclesByMember.get(memberId) || []), vehicle])
  }
  const normalizedItems = items.map((item) => {
    const lastActivityAt = item.lastSeenAt || item.lastLoginAt || null
    const isOnline = item.status === 'active' && !!lastActivityAt && new Date(lastActivityAt).getTime() >= onlineSince.getTime()
    const memberVehicles = vehiclesByMember.get(String(item._id)) || []
    return { ...item, lastActivityAt, isOnline, vehicles: memberVehicles, vehicleCount: memberVehicles.length }
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
