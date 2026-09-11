import crypto from 'node:crypto'
import { z } from 'zod'
import { getRedisClient } from '../utils/redisCache'

export const FORUM_EVENT_MAX_CLOCK_SKEW_SECONDS = 300
const FORUM_EVENT_DEDUPE_SECONDS = 600
const MAX_LOCAL_DEDUPE_KEYS = 1000

const forumEventSchema = z.object({
  eventId: z.string().min(8).max(180).regex(/^[A-Za-z0-9:_.-]+$/),
  type: z.enum(['user_registered', 'discussion_started', 'post_created']),
  username: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).optional(),
  discussionTitle: z.string().trim().max(300).optional(),
  content: z.string().trim().max(2000).optional(),
  url: z.string().url().max(1000).optional(),
  isPrivileged: z.boolean().optional(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict()

export type ForumEventPayload = z.infer<typeof forumEventSchema>

const localDedupe = new Map<string, number>()

export function createForumEventSignature(timestamp: string, encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${encodedPayload}`).digest('hex')
}

export function verifyForumEventSignature(
  timestamp: string,
  encodedPayload: string,
  signature: string,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!/^\d{10}$/.test(timestamp) || !/^[A-Fa-f0-9]{64}$/.test(signature) || secret.length < 32) return false
  const requestTimeMs = Number(timestamp) * 1000
  if (!Number.isSafeInteger(requestTimeMs) || Math.abs(nowMs - requestTimeMs) > FORUM_EVENT_MAX_CLOCK_SKEW_SECONDS * 1000) return false
  const expected = createForumEventSignature(timestamp, encodedPayload, secret)
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 24_000) throw new Error('invalid_payload')
  return Buffer.from(value, 'base64url').toString('utf8')
}

export function parseForumEvent(encodedPayload: string, configuredForumUrl?: string): ForumEventPayload {
  let raw: unknown
  try {
    raw = JSON.parse(decodeBase64Url(encodedPayload))
  } catch {
    throw new Error('invalid_payload')
  }
  const parsed = forumEventSchema.safeParse(raw)
  if (!parsed.success) throw new Error('invalid_payload')
  if (parsed.data.url) {
    if (!configuredForumUrl) throw new Error('invalid_event_url')
    const expected = new URL(configuredForumUrl)
    const actual = new URL(parsed.data.url)
    if (actual.protocol !== expected.protocol || actual.host !== expected.host) throw new Error('invalid_event_url')
  }
  return parsed.data
}

export async function reserveForumEvent(eventId: string): Promise<boolean> {
  const redis = getRedisClient()
  const key = `forum:event:${eventId}`
  if (redis?.status === 'ready') {
    try {
      return (await redis.set(key, '1', 'EX', FORUM_EVENT_DEDUPE_SECONDS, 'NX')) === 'OK'
    } catch {
      // Fall through to the bounded local cache while Redis reconnects.
    }
  }

  const now = Date.now()
  const existing = localDedupe.get(key)
  if (existing && existing > now) return false
  if (localDedupe.size >= MAX_LOCAL_DEDUPE_KEYS) {
    for (const [entryKey, expiresAt] of localDedupe) {
      if (expiresAt <= now || localDedupe.size >= MAX_LOCAL_DEDUPE_KEYS) localDedupe.delete(entryKey)
      if (localDedupe.size < MAX_LOCAL_DEDUPE_KEYS) break
    }
  }
  localDedupe.set(key, now + FORUM_EVENT_DEDUPE_SECONDS * 1000)
  return true
}

export function formatForumEventNotification(
  event: ForumEventPayload,
  options: { locale?: 'en' | 'zh-hans'; timezone?: string } = {},
): {
  title: string
  content: string
  markdown: string
  actionUrl?: string
} {
  const zh = options.locale !== 'en'
  const text = zh ? {
    titles: { user_registered: '新用户注册', discussion_started: '新帖发布', post_created: '新回复' },
    icons: { user_registered: '📢', discussion_started: '📝', post_created: '💬' },
    user: '用户名', author: '发帖人', email: '邮箱', topic: '标题', content: '内容', beijing: '北京时间', local: '当地时间', view: '查看',
  } : {
    titles: { user_registered: 'New User Registered', discussion_started: 'New Discussion', post_created: 'New Reply' },
    icons: { user_registered: '📢', discussion_started: '📝', post_created: '💬' },
    user: 'Username', author: 'Author', email: 'Email', topic: 'Topic', content: 'Content', beijing: 'Beijing Time', local: 'Local Time', view: 'View',
  }
  const locale = zh ? 'zh-CN' : 'en-US'
  const time = new Date(event.occurredAt)
  const beijingTime = time.toLocaleString(locale, { timeZone: 'Asia/Shanghai', hour12: false })
  const localTime = options.timezone
    ? time.toLocaleString(locale, { timeZone: options.timezone, hour12: false })
    : null
  const userLabel = event.type === 'user_registered' ? text.user : text.author
  const lines = [`${userLabel}: ${event.username}`]
  if (event.email) lines.push(`${text.email}: ${event.email}`)
  if (event.discussionTitle) lines.push(`${text.topic}: ${event.discussionTitle}`)
  if (event.content) lines.push(`${text.content}: ${event.content}`)
  lines.push(`${text.beijing}: ${beijingTime}`)
  if (localTime) lines.push(`${text.local} (${options.timezone}): ${localTime}`)
  if (event.url) lines.push(`${text.view}: ${event.url}`)
  const markdownLines = [
    `> **${userLabel}**`,
    `> ${escapeMarkdown(event.username)}`,
    ...(event.email ? [`> **${text.email}**`, `> ${escapeMarkdown(event.email)}`] : []),
    ...(event.discussionTitle ? [`#### ${text.topic}`, escapeMarkdown(event.discussionTitle)] : []),
    ...(event.content ? [`#### ${text.content}`, escapeMarkdown(event.content)] : []),
    '---',
    `🕐 **${text.beijing}**  ${escapeMarkdown(beijingTime)}`,
    ...(localTime ? [`🌐 **${text.local} (${escapeMarkdown(options.timezone || '')})**  ${escapeMarkdown(localTime)}`] : []),
  ]
  return {
    title: `${text.icons[event.type]} ${text.titles[event.type]}`,
    content: lines.join('\n'),
    markdown: markdownLines.join('\n'),
    ...(event.url ? { actionUrl: event.url } : {}),
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]{}()#+.!|>~-]/g, '\\$&').replace(/[\r\n\t]+/g, ' ')
}
