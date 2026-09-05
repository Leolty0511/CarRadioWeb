import net from 'node:net'
import type { Request, Response, NextFunction } from 'express'
import { getRedisClient } from '../utils/redisCache'
import { SecurityBan, SecurityEvent, SecurityIp, SecurityRequest, SecuritySettings, SecurityWhitelist } from '../models/Security'
import { getClientIP } from './geoLocationService'

const queue: Array<Record<string, unknown>> = []
let flushRunning = false
let settingsCache: { value: any; expiresAt: number } | null = null
let whitelistCache: { value: Set<string>; expiresAt: number } | null = null
let settingsLoad: Promise<any> | null = null
let whitelistLoad: Promise<Set<string>> | null = null
const eventCooldown = new Map<string, number>()
const MAX_EVENT_KEYS = 10000
const trustedProxyIps = new Set((process.env.TRUSTED_PROXY_IPS || '127.0.0.1,::1').split(',').map(value => value.trim()).filter(Boolean))
const memoryMinuteCounts = new Map<string, { minute: number; count: number }>()

export function isValidIp(ip: string): boolean { return net.isIP(ip) !== 0 }

/** Only trust forwarding headers from a configured reverse proxy (or local nginx). */
export function getTrustedClientIp(req: Request): string {
  const remote = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '')
  const fromProxy = trustedProxyIps.has(remote) || trustedProxyIps.has(req.ip?.replace(/^::ffff:/, '') || '')
  if (fromProxy) {
    const cf = req.headers['cf-connecting-ip']
    const real = req.headers['x-real-ip']
    const forwarded = req.headers['x-forwarded-for']
    const candidate = typeof cf === 'string' ? cf.trim() : typeof real === 'string' ? real.trim() : typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : ''
    if (isValidIp(candidate)) return candidate
  }
  const fallback = getClientIP({ headers: {}, socket: req.socket, connection: req.connection, ip: remote })
  return isValidIp(fallback) ? fallback : '0.0.0.0'
}

const DEFAULT_SETTINGS = { requestsPerMinute: 120, hardLimit: 300, apiRequestsPerMinute: 180, loginFailures: 10, notFoundThreshold: 100, suspiciousThreshold: 120, autoBan: true, defaultBanDurationHours: 24, autoUnban: true, crowdsecEnabled: false }
async function getSettings() {
  if (settingsCache && settingsCache.expiresAt > Date.now()) return settingsCache.value
  if (!settingsLoad) settingsLoad = SecuritySettings.findOne({ key: 'default' }).lean().then(value => {
    const result = value || DEFAULT_SETTINGS
    settingsCache = { value: result, expiresAt: Date.now() + 10_000 }
    return result
  }).finally(() => { settingsLoad = null })
  return settingsLoad
}
async function getWhitelist() {
  if (whitelistCache && whitelistCache.expiresAt > Date.now()) return whitelistCache.value
  if (!whitelistLoad) whitelistLoad = SecurityWhitelist.find().select('ip').lean().then(items => {
    const value = new Set(items.map(item => item.ip))
    whitelistCache = { value, expiresAt: Date.now() + 30_000 }
    return value
  }).finally(() => { whitelistLoad = null })
  return whitelistLoad
}
async function isWhitelisted(ip: string) { return (await getWhitelist()).has(ip) }
export function invalidateSecurityCaches() { settingsCache = null; whitelistCache = null; settingsLoad = null; whitelistLoad = null }

async function redisCount(ip: string): Promise<number> {
  const redis = getRedisClient()
  if (redis) {
    const key = `security:requests:${ip}:${Math.floor(Date.now() / 60000)}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 120)
    return count
  }
  const minute = Math.floor(Date.now() / 60_000)
  const current = memoryMinuteCounts.get(ip)
  if (!current || current.minute !== minute) {
    if (memoryMinuteCounts.size >= 10_000) memoryMinuteCounts.delete(memoryMinuteCounts.keys().next().value || ip)
    memoryMinuteCounts.set(ip, { minute, count: 1 })
    return 1
  }
  current.count += 1
  return current.count
}

async function enqueue(item: Record<string, unknown>) { if (queue.length < 5000) queue.push(item) }
async function flush() {
  if (flushRunning || queue.length === 0) return
  flushRunning = true
  const items = queue.splice(0, 500)
  try {
    await SecurityRequest.insertMany(items, { ordered: false })
    const grouped = new Map<string, Record<string, unknown>>()
    for (const item of items) grouped.set(String(item.ip), item)
    await SecurityIp.bulkWrite([...grouped.values()].map(item => {
      const value = item as { ip: string; time: Date; url: string; method: string; statusCode: number; userAgent: string; referer: string; requestsPerMinute: number }
      return { updateOne: { filter: { ip: value.ip }, update: { $setOnInsert: { firstSeenAt: value.time }, $set: { lastSeenAt: value.time, lastUrl: value.url, lastMethod: value.method, lastStatusCode: value.statusCode, lastUserAgent: value.userAgent, lastReferer: value.referer, requestsPerMinute: value.requestsPerMinute }, $inc: { requestCount: 1 } }, upsert: true } }
    }))
  } finally { flushRunning = false }
}
setInterval(() => { void flush() }, 5000).unref()
setInterval(() => {
  void (async () => {
    const expired = await SecurityBan.find({ active: true, expiresAt: { $lte: new Date(), $ne: null } }).select('ip').lean()
    if (!expired.length) return
    await SecurityBan.updateMany({ ip: { $in: expired.map(item => item.ip) }, active: true }, { $set: { active: false, unbannedAt: new Date() } })
    await SecurityIp.updateMany({ ip: { $in: expired.map(item => item.ip) }, status: 'blocked' }, { $set: { status: 'normal' } })
  })().catch(() => undefined)
}, 60_000).unref()

export async function trackRequest(req: Request, res: Response, responseTimeMs: number) {
  const ip = getTrustedClientIp(req)
  const minuteCount = await redisCount(ip).catch(() => 0)
  const settings = await getSettings().catch(() => null)
  const whitelisted = await isWhitelisted(ip).catch(() => false)
  const suspicious = !whitelisted && Boolean(settings && minuteCount >= settings.suspiciousThreshold)
  const automaticBan = !whitelisted && Boolean(settings?.autoBan && minuteCount >= settings.hardLimit)
  const time = new Date()
  await enqueue({ ip, time, method: req.method, url: req.originalUrl.slice(0, 2048), statusCode: res.statusCode, userAgent: String(req.get('user-agent') || '').slice(0, 1024), referer: String(req.get('referer') || '').slice(0, 1024), responseTimeMs, requestsPerMinute: minuteCount })
  if (suspicious || automaticBan) {
    const rule = automaticBan ? 'Excessive Requests' : 'Rate Limit'
    const eventKey = `${ip}:${rule}`
    const now = Date.now()
    const lastEvent = eventCooldown.get(eventKey) || 0
    if (now - lastEvent < 60_000) return
    if (eventCooldown.size >= MAX_EVENT_KEYS) {
      const oldest = eventCooldown.keys().next().value
      if (oldest) eventCooldown.delete(oldest)
    }
    eventCooldown.set(eventKey, now)
    await SecurityEvent.create({ ip, rule, severity: automaticBan ? 'high' : 'medium', details: `${minuteCount} requests/minute`, requestCount: minuteCount }).catch(() => undefined)
    await SecurityIp.updateOne({ ip }, { $set: { status: automaticBan ? 'blocked' : 'suspicious', lastRule: rule } }, { upsert: true }).catch(() => undefined)
    if (automaticBan) await banIp(ip, rule, 'automatic', undefined, undefined, settings?.defaultBanDurationHours ?? 24).catch(() => undefined)
  }
}

export function securityTrackingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path.toLowerCase()
  const ignored = req.method === 'OPTIONS' || path === '/health' || path.startsWith('/uploads/') || /\.(?:js|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf)$/.test(path)
  if (ignored) { next(); return }
  const started = Date.now()
  res.on('finish', () => { void trackRequest(req, res, Date.now() - started) })
  next()
}

export async function banIp(ip: string, reason: string, source: 'manual' | 'automatic' | 'crowdsec', adminId?: string, adminName?: string, durationHours?: number) {
  if (!isValidIp(ip)) throw new Error('invalid_ip')
  if (await isWhitelisted(ip)) throw new Error('ip_whitelisted')
  const existing = await SecurityBan.findOne({ ip, active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
  if (existing) return existing
  const expiresAt = durationHours && durationHours > 0 ? new Date(Date.now() + durationHours * 3600000) : null
  await SecurityBan.updateMany({ ip, active: true }, { $set: { active: false, unbannedAt: new Date() } })
  const ban = await SecurityBan.create({ ip, reason: reason.trim().slice(0, 500), source, adminId, adminName, expiresAt, active: true })
  await SecurityIp.updateOne({ ip }, { $set: { status: 'blocked', lastRule: reason } }, { upsert: true })
  const redis = getRedisClient(); if (redis) { const key = `security:ban:${ip}`; if (expiresAt) await redis.set(key, '1', 'EX', Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))); else await redis.set(key, '1') }
  return ban
}
export async function unbanIp(ip: string) { if (!isValidIp(ip)) throw new Error('invalid_ip'); await SecurityBan.updateMany({ ip, active: true }, { $set: { active: false, unbannedAt: new Date() } }); await SecurityIp.updateOne({ ip }, { $set: { status: 'normal' } }); const redis = getRedisClient(); if (redis) await redis.del(`security:ban:${ip}`) }

export { SecurityBan, SecurityEvent, SecurityIp, SecurityRequest, SecuritySettings, SecurityWhitelist }
