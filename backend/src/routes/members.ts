import { Router } from 'express'
import crypto from 'crypto'
import Member from '../models/Member'
import MemberSettings, { getMemberSettings } from '../models/MemberSettings'
import MemberInvitation from '../models/MemberInvitation'
import { requireSuperAdmin } from '../middleware/auth'

const router = Router()
router.use(requireSuperAdmin)

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
  const search = String(req.query.search || '').trim()
  const status = String(req.query.status || '')
  const filter: Record<string, unknown> = {}
  if (['pending', 'active', 'rejected', 'suspended'].includes(status)) filter.status = status
  if (search) filter.$or = [
    { email: { $regex: search, $options: 'i' } },
    { nickname: { $regex: search, $options: 'i' } },
    { registrationIp: { $regex: search, $options: 'i' } },
  ]
  const [items, total] = await Promise.all([
    Member.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Member.countDocuments(filter),
  ])
  res.json({ success: true, data: { items, page, limit, total, totalPages: Math.ceil(total / limit) } })
})

router.put('/:id/status', async (req, res) => {
  const status = String(req.body.status || '')
  const reviewNote = String(req.body.reviewNote || '').trim()
  if (!['active', 'rejected', 'suspended'].includes(status)) {
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

router.get('/settings/current', async (_req, res) => {
  res.json({ success: true, data: await getMemberSettings() })
})

router.put('/settings/current', async (req, res) => {
  const settings = await MemberSettings.findOneAndUpdate(
    { key: 'global' },
    { $set: {
      registrationEnabled: req.body.registrationEnabled !== false,
      approvalRequired: req.body.approvalRequired === true,
      invitationRequired: req.body.invitationRequired === true,
      updatedBy: req.user!._id,
    } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  res.json({ success: true, data: settings })
})

router.get('/invitations/list', async (_req, res) => {
  const items = await MemberInvitation.find().sort({ createdAt: -1 }).lean()
  res.json({ success: true, data: items })
})

router.post('/invitations', async (req, res) => {
  const code = crypto.randomBytes(9).toString('base64url').toUpperCase()
  const prefix = code.slice(0, 4)
  const maxUses = Math.min(10000, Math.max(1, Number(req.body.maxUses) || 1))
  const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null
  const invitation = await MemberInvitation.create({
    codeHash: crypto.createHash('sha256').update(code).digest('hex'),
    prefix,
    note: String(req.body.note || '').trim(),
    maxUses,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    createdBy: req.user!._id,
  })
  res.status(201).json({ success: true, data: invitation, code })
})

router.put('/invitations/:id', async (req, res) => {
  const invitation = await MemberInvitation.findByIdAndUpdate(req.params.id, {
    $set: { enabled: req.body.enabled === true },
  }, { new: true })
  if (!invitation) return res.status(404).json({ success: false, error: 'invitation_not_found' })
  res.json({ success: true, data: invitation })
})

export default router
