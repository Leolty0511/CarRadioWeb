import { z } from 'zod'
import SystemConfig, {
  type DingtalkConfig,
  type ForumNotificationChannelType,
  type ForumNotificationSettings,
  type NotificationConfig,
  type ServerChanConfig,
  type SmtpConfig,
  type WecomConfig,
  type WebhookConfig,
} from '../models/SystemConfig'
import { formatForumEventNotification, type ForumEventPayload } from './forumEventService'
import { getLegacyForumNotificationSettings } from './forumService'
import { notificationService } from './notificationService'
import { createLogger } from '../utils/logger'

const logger = createLogger('forum-notification')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CHANNELS: ForumNotificationChannelType[] = ['wecom', 'dingtalk', 'serverchan', 'email', 'webhook']
const SETTINGS_CACHE_MS = 60_000
const MAX_PENDING_EVENTS = 100
const MAX_CONCURRENT_EVENTS = 2

const optionalHttpUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}, 'URL 必须是有效的 HTTP(S) 地址')

const forumNotificationSchema = z.object({
  enabled: z.boolean(),
  locale: z.enum(['en', 'zh-hans']),
  timezone: z.string().trim().max(100).refine((value) => {
    if (!value) return true
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, '时区必须使用有效的 IANA 名称'),
  skipAdminMod: z.boolean(),
  channels: z.object({
    wecom: z.object({ enabled: z.boolean(), webhook: optionalHttpUrl }),
    dingtalk: z.object({ enabled: z.boolean(), webhook: optionalHttpUrl, secret: z.string().max(512) }),
    serverchan: z.object({ enabled: z.boolean(), uid: z.string().max(100), sendKey: z.string().max(512) }),
    email: z.object({
      enabled: z.boolean(), recipients: z.string().max(2000), host: z.string().max(500),
      port: z.number().int().min(1).max(65535), secure: z.boolean(), user: z.string().max(500),
      pass: z.string().max(2000), from: z.string().max(500),
    }),
    webhook: z.object({ enabled: z.boolean(), url: optionalHttpUrl, method: z.enum(['POST', 'PUT']), headers: z.string().max(8000) }),
  }),
}).strict()

export const DEFAULT_FORUM_NOTIFICATION_SETTINGS: ForumNotificationSettings = {
  enabled: false,
  locale: 'zh-hans',
  timezone: '',
  skipAdminMod: false,
  channels: {
    wecom: { enabled: false, webhook: '' },
    dingtalk: { enabled: false, webhook: '', secret: '' },
    serverchan: { enabled: false, uid: '', sendKey: '' },
    email: { enabled: false, recipients: '', host: '', port: 465, secure: true, user: '', pass: '', from: '' },
    webhook: { enabled: false, url: '', method: 'POST', headers: '' },
  },
}

function bool(value?: string): boolean {
  return value === '1' || value === 'true'
}

export function settingsFromLegacy(values: Record<string, string>): ForumNotificationSettings {
  const key = (name: string) => values[`leo-t-notify-push.${name}`] || ''
  const settings: ForumNotificationSettings = {
    enabled: ['wecom_enabled', 'dingtalk_enabled', 'serverchan_enabled', 'email_enabled', 'webhook_enabled'].some((name) => bool(key(name))),
    locale: key('push_locale').toLowerCase() === 'en' ? 'en' : 'zh-hans',
    timezone: key('push_timezone'),
    skipAdminMod: bool(key('skip_admin_mod')),
    channels: {
      wecom: { enabled: bool(key('wecom_enabled')), webhook: key('wecom_webhook_url') },
      dingtalk: { enabled: bool(key('dingtalk_enabled')), webhook: key('dingtalk_webhook_url'), secret: key('dingtalk_secret') },
      serverchan: { enabled: bool(key('serverchan_enabled')), uid: '', sendKey: key('serverchan_send_key') },
      email: {
        enabled: bool(key('email_enabled')),
        recipients: key('email_recipients'),
        host: values.mail_host || '',
        port: Number.parseInt(values.mail_port || '', 10) || 465,
        secure: String(values.mail_encryption || '').toLowerCase() === 'ssl' || Number.parseInt(values.mail_port || '', 10) === 465,
        user: values.mail_username || '',
        pass: values.mail_password || '',
        from: values.mail_from || values.mail_username || '',
      },
      webhook: {
        enabled: bool(key('webhook_enabled')),
        url: key('webhook_url'),
        method: key('webhook_method').toUpperCase() === 'PUT' ? 'PUT' : 'POST',
        headers: key('webhook_headers'),
      },
    },
  }
  return normalizeSettings(settings)
}

export function normalizeSettings(value: unknown): ForumNotificationSettings {
  const input = value && typeof value === 'object' ? value as Partial<ForumNotificationSettings> : {}
  const channels: Partial<ForumNotificationSettings['channels']> = input.channels && typeof input.channels === 'object'
    ? input.channels
    : {}
  return forumNotificationSchema.parse({
    ...DEFAULT_FORUM_NOTIFICATION_SETTINGS,
    ...input,
    channels: {
      wecom: { ...DEFAULT_FORUM_NOTIFICATION_SETTINGS.channels.wecom, ...channels.wecom },
      dingtalk: { ...DEFAULT_FORUM_NOTIFICATION_SETTINGS.channels.dingtalk, ...channels.dingtalk },
      serverchan: { ...DEFAULT_FORUM_NOTIFICATION_SETTINGS.channels.serverchan, ...channels.serverchan },
      email: { ...DEFAULT_FORUM_NOTIFICATION_SETTINGS.channels.email, ...channels.email },
      webhook: { ...DEFAULT_FORUM_NOTIFICATION_SETTINGS.channels.webhook, ...channels.webhook },
    },
  }) as ForumNotificationSettings
}

function channelError(settings: ForumNotificationSettings, channel: ForumNotificationChannelType): string | null {
  const config = settings.channels[channel]
  if (channel === 'wecom' && !settings.channels.wecom.webhook) return '请填写企业微信 Webhook URL'
  if (channel === 'dingtalk' && !settings.channels.dingtalk.webhook) return '请填写钉钉 Webhook URL'
  if (channel === 'serverchan' && !settings.channels.serverchan.sendKey) return '请填写 Server酱 SendKey'
  if (channel === 'email') {
    const email = settings.channels.email
    const recipients = email.recipients.split(',').map((value) => value.trim()).filter(Boolean)
    if (!recipients.length || recipients.some((value) => !EMAIL.test(value))) return '请填写有效的收件邮箱，多个邮箱使用英文逗号分隔'
    if (!email.host) return '请填写论坛推送 SMTP 主机'
  }
  if (channel === 'webhook' && !settings.channels.webhook.url) return '请填写 Webhook URL'
  return config ? null : '未知推送渠道'
}

function parseLegacyHeaders(value: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of value.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const name = line.slice(0, separator).trim()
    const headerValue = line.slice(separator + 1).trim()
    if (/^[A-Za-z0-9-]+$/.test(name) && headerValue) headers[name] = headerValue
  }
  return headers
}

function forumUrl(): string {
  const raw = String(process.env.FORUM_BASE_URL || process.env.FORUM_OAUTH_REDIRECT_URI || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (/\/auth\/passport\/?$/.test(url.pathname)) return url.origin
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function shouldSendForumEvent(settings: ForumNotificationSettings, event: ForumEventPayload): boolean {
  return settings.enabled && !(settings.skipAdminMod && event.type !== 'user_registered' && event.isPrivileged)
}

class ForumNotificationService {
  private settingsCache: { value: ForumNotificationSettings; expiresAt: number } | null = null
  private settingsLoad: Promise<ForumNotificationSettings> | null = null
  private readonly pendingEvents: ForumEventPayload[] = []
  private activeEvents = 0

  async getSettings(): Promise<ForumNotificationSettings> {
    if (this.settingsCache && this.settingsCache.expiresAt > Date.now()) return this.settingsCache.value
    if (this.settingsLoad) return this.settingsLoad
    this.settingsLoad = this.loadSettings().finally(() => {
      this.settingsLoad = null
    })
    return this.settingsLoad
  }

  private async loadSettings(): Promise<ForumNotificationSettings> {
    const stored = await SystemConfig.getConfig('forum_notification')
    if (stored) return this.cacheSettings(normalizeSettings(stored))

    const legacy = await getLegacyForumNotificationSettings()
    const initial = legacy && Object.keys(legacy).length ? settingsFromLegacy(legacy) : DEFAULT_FORUM_NOTIFICATION_SETTINGS
    const result = await SystemConfig.updateConfig('forum_notification', initial, legacy ? 'legacy-forum-import' : 'system')
    return this.cacheSettings(normalizeSettings(result.config))
  }

  private cacheSettings(settings: ForumNotificationSettings): ForumNotificationSettings {
    this.settingsCache = { value: settings, expiresAt: Date.now() + SETTINGS_CACHE_MS }
    return settings
  }

  async updateSettings(value: unknown, updatedBy: string): Promise<ForumNotificationSettings> {
    const settings = normalizeSettings(value)
    for (const channel of CHANNELS) {
      if (settings.channels[channel].enabled) {
        const error = channelError(settings, channel)
        if (error) throw new Error(error)
      }
    }
    const result = await SystemConfig.updateConfig('forum_notification', settings, updatedBy)
    return this.cacheSettings(normalizeSettings(result.config))
  }

  enqueue(event: ForumEventPayload): boolean {
    if (this.pendingEvents.length >= MAX_PENDING_EVENTS) {
      logger.warn({ eventId: event.eventId, pending: this.pendingEvents.length }, 'Forum notification queue is full; event dropped')
      return false
    }
    this.pendingEvents.push(event)
    setImmediate(() => this.drainQueue())
    return true
  }

  private drainQueue(): void {
    while (this.activeEvents < MAX_CONCURRENT_EVENTS && this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()
      if (!event) return
      this.activeEvents += 1
      void this.notify(event)
        .catch((error) => logger.error({ error, eventId: event.eventId }, 'Forum event notification failed'))
        .finally(() => {
          this.activeEvents -= 1
          this.drainQueue()
        })
    }
  }

  async notify(event: ForumEventPayload): Promise<void> {
    const settings = await this.getSettings()
    if (!shouldSendForumEvent(settings, event)) return
    const payload = {
      ...formatForumEventNotification(event, { locale: settings.locale, timezone: settings.timezone }),
      actionLabel: settings.locale === 'en' ? 'View Details' : '查看详情',
      timestamp: event.occurredAt,
    }
    const enabled = CHANNELS.filter((channel) => settings.channels[channel].enabled)
    const results = await Promise.all(enabled.map((channel) => this.send(channel, settings, payload)))
    const failed = results.filter((result) => !result.success)
    const details = results.map((result, index) => ({ channel: enabled[index], success: result.success, message: result.message }))
    if (failed.length > 0) {
      logger.warn({ eventId: event.eventId, results: details }, 'Forum notification dispatch completed with failures')
    } else {
      logger.info({ eventId: event.eventId, channels: enabled }, 'Forum notification dispatch complete')
    }
  }

  async test(value: unknown, channel: ForumNotificationChannelType): Promise<{ success: boolean; message: string }> {
    if (!CHANNELS.includes(channel)) throw new Error('未知推送渠道')
    const settings = normalizeSettings(value)
    const error = channelError(settings, channel)
    if (error) throw new Error(error)
    const now = new Date().toISOString()
    const payload = {
      ...formatForumEventNotification({
        eventId: `forum:test:${Date.now()}`,
        type: 'discussion_started' as const,
        username: 'CarRadioWeb',
        discussionTitle: settings.locale === 'en' ? 'Forum notification test' : '论坛推送测试',
        content: settings.locale === 'en' ? 'The forum notification channel is working.' : '论坛推送渠道连接正常。',
        occurredAt: now,
        ...(forumUrl() ? { url: forumUrl() } : {}),
      }, { locale: settings.locale, timezone: settings.timezone }),
      actionLabel: settings.locale === 'en' ? 'Open Forum' : '打开论坛',
      timestamp: now,
    }
    return this.send(channel, settings, payload)
  }

  private async send(
    channel: ForumNotificationChannelType,
    settings: ForumNotificationSettings,
    payload: ReturnType<typeof formatForumEventNotification> & { actionLabel: string; timestamp: string },
  ): Promise<{ success: boolean; message: string }> {
    if (channel === 'email') {
      const email = settings.channels.email
      const result = await notificationService.sendChannel('smtp', {
        enabled: true,
        host: email.host,
        port: email.port,
        secure: email.secure,
        user: email.user,
        pass: email.pass,
        from: email.from || email.user,
        to: email.recipients,
      } satisfies SmtpConfig, { ...payload, title: `[Forum] ${payload.title}` })
      return { success: result.success, message: result.message }
    }

    let notificationChannel: 'wecom' | 'dingtalk' | 'serverchan' | 'webhook'
    let config: NotificationConfig
    if (channel === 'webhook') {
      const webhook = settings.channels.webhook
      notificationChannel = 'webhook'
      config = {
        enabled: true,
        url: webhook.url,
        method: webhook.method,
        headers: JSON.stringify(parseLegacyHeaders(webhook.headers)),
        bodyTemplate: '{"title":"{{title}}","body":"{{content}}","url":"{{url}}","timestamp":"{{timestamp}}"}',
      } satisfies WebhookConfig
    } else {
      notificationChannel = channel
      config = { ...settings.channels[channel], enabled: true } as DingtalkConfig | WecomConfig | ServerChanConfig
    }
    const result = await notificationService.sendChannel(notificationChannel, config, payload)
    return { success: result.success, message: result.message }
  }
}

export const forumNotificationService = new ForumNotificationService()
