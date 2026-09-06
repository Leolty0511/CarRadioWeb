import { Router, Request, Response } from 'express'
import { authenticateUser, requireSuperAdmin } from '../middleware/auth'
import { SecurityBan, SecurityEvent, SecurityIp, SecurityRequest, SecuritySettings, SecurityWhitelist } from '../services/securityService'
import { banIp, invalidateSecurityCaches, isValidIp, unbanIp } from '../services/securityService'
import AuditLog from '../models/AuditLog'

const router = Router()
router.use(authenticateUser)

router.get('/dashboard', async (_req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [blockedIps, suspiciousIps, attacksToday, activeIps, todayBans, recentEvents, topRequestIps, topAttackIps] = await Promise.all([
    SecurityBan.countDocuments({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }),
    SecurityIp.countDocuments({ status: 'suspicious' }),
    SecurityEvent.countDocuments({ createdAt: { $gte: today } }),
    SecurityIp.countDocuments({ lastSeenAt: { $gte: new Date(Date.now() - 15 * 60_000) } }),
    SecurityBan.countDocuments({ bannedAt: { $gte: today } }),
    SecurityEvent.find().sort({ createdAt: -1 }).limit(20).lean(),
    SecurityIp.find().sort({ requestCount: -1 }).limit(10).select('ip requestCount lastSeenAt status').lean(),
    SecurityEvent.aggregate([{ $match: { createdAt: { $gte: today } } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$ip', count: { $sum: 1 }, lastRule: { $first: '$rule' } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
  ])
  res.json({ success: true, data: { blockedIps, suspiciousIps, attacksToday, activeIps, todayBans, recentEvents, topRequestIps, topAttackIps } })
})

router.get('/ips', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25))
  const filter: Record<string, unknown> = {}
  if (typeof req.query.ip === 'string' && req.query.ip) filter.ip = { $regex: req.query.ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  if (typeof req.query.url === 'string' && req.query.url) filter.lastUrl = { $regex: req.query.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  if (['normal', 'suspicious', 'blocked'].includes(String(req.query.status))) filter.status = req.query.status
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) filter.lastSeenAt = { ...(from && !Number.isNaN(from.getTime()) ? { $gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { $lte: to } : {}) }
  const [items, total] = await Promise.all([SecurityIp.find(filter).sort({ lastSeenAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), SecurityIp.countDocuments(filter)])
  res.json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } })
})

router.get('/ips/:ip', async (req, res) => {
  const ip = req.params.ip; if (!isValidIp(ip)) return res.status(400).json({ success: false, error: 'invalid_ip' })
  const [summary, requests, events, ban] = await Promise.all([SecurityIp.findOne({ ip }).lean(), SecurityRequest.find({ ip }).sort({ time: -1 }).limit(100).lean(), SecurityEvent.find({ ip }).sort({ createdAt: -1 }).limit(100).lean(), SecurityBan.findOne({ ip, active: true }).sort({ bannedAt: -1 }).lean()])
  res.json({ success: true, data: { summary, requests, events, ban } })
})

router.get('/events', async (req, res) => { const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50)); const items = await SecurityEvent.find().sort({ createdAt: -1 }).limit(limit).lean(); res.json({ success: true, data: items }) })
router.get('/settings', async (_req, res) => { const settings = await SecuritySettings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); res.json({ success: true, data: settings }) })
router.put('/settings', requireSuperAdmin, async (req, res) => {
  const numeric = ['requestsPerMinute', 'hardLimit', 'apiRequestsPerMinute', 'loginFailures', 'notFoundThreshold', 'suspiciousThreshold', 'defaultBanDurationHours']
  const update: Record<string, unknown> = {}
  for (const key of numeric) {
    if (req.body?.[key] === undefined) continue
    const value = Number(req.body[key])
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000) return res.status(400).json({ success: false, error: 'invalid_settings' })
    update[key] = value
  }
  for (const key of ['autoBan', 'autoUnban', 'crowdsecEnabled']) if (req.body?.[key] !== undefined) {
    if (typeof req.body[key] !== 'boolean') return res.status(400).json({ success: false, error: 'invalid_settings' })
    update[key] = req.body[key]
  }
  const current = await SecuritySettings.findOne({ key: 'default' }).lean()
  const merged = { requestsPerMinute: 120, hardLimit: 300, suspiciousThreshold: 120, ...(current || {}), ...update }
  if (Number(merged.hardLimit) < Number(merged.requestsPerMinute) || Number(merged.suspiciousThreshold) > Number(merged.hardLimit)) return res.status(400).json({ success: false, error: 'invalid_threshold_order' })
  const settings = await SecuritySettings.findOneAndUpdate({ key: 'default' }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true })
  invalidateSecurityCaches(); res.json({ success: true, data: settings })
})

router.get('/whitelist', async (_req, res) => { res.json({ success: true, data: await SecurityWhitelist.find().sort({ createdAt: -1 }).lean() }) })
router.post('/whitelist', requireSuperAdmin, async (req, res) => { const { ip, note } = req.body; if (!isValidIp(ip)) return res.status(400).json({ success: false, error: 'invalid_ip' }); const item = await SecurityWhitelist.create({ ip, note, addedBy: req.user?._id }); invalidateSecurityCaches(); res.status(201).json({ success: true, data: item }) })
router.delete('/whitelist/:ip', requireSuperAdmin, async (req, res) => { if (!isValidIp(req.params.ip)) return res.status(400).json({ success: false, error: 'invalid_ip' }); await SecurityWhitelist.deleteOne({ ip: req.params.ip }); invalidateSecurityCaches(); res.json({ success: true }) })

router.post('/ban', requireSuperAdmin, async (req, res) => {
  const { ip, reason, durationHours } = req.body || {}
  const duration = durationHours === undefined || durationHours === null || durationHours === '' ? 24 : Number(durationHours)
  if (!isValidIp(ip) || typeof reason !== 'string' || !reason.trim() || !Number.isInteger(duration) || ![0, 1, 6, 24, 168].includes(duration)) return res.status(400).json({ success: false, error: 'invalid_request' })
  try { const ban = await banIp(ip, reason, 'manual', String(req.user?._id), req.user?.nickname, duration || undefined); await AuditLog.create({ userId: req.user!._id, nickname: req.user!.nickname, email: req.user!.email ?? req.user!.loginUsername ?? '', action: 'create', resource: 'security-ban', resourceId: ip, summary: `封禁 IP：${ip}，原因：${reason}`, ipAddress: req.ip || '' }); res.json({ success: true, data: ban }) } catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'ban_failed' }) }
})
router.post('/unban', requireSuperAdmin, async (req, res) => { const { ip } = req.body; if (!isValidIp(ip)) return res.status(400).json({ success: false, error: 'invalid_ip' }); await unbanIp(ip); await AuditLog.create({ userId: req.user!._id, nickname: req.user!.nickname, email: req.user!.email ?? req.user!.loginUsername ?? '', action: 'update', resource: 'security-ban', resourceId: ip, summary: `解封 IP：${ip}`, ipAddress: req.ip || '' }); res.json({ success: true }) })

export default router
