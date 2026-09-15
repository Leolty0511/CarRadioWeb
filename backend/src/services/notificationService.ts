/**
 * Unified notification service
 * Supports 6 channels: DingTalk, WeCom, Feishu, ServerChan, SMTP, Webhook
 * Each channel can be independently enabled/disabled
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { getDualTime, formatDualTime } from './geoLocationService';
import SystemConfig, {
  type DingtalkConfig,
  type DingtalkMessageStyle,
  type WecomConfig,
  type FeishuConfig,
  type ServerChanConfig,
  type SmtpConfig,
  type WebhookConfig,
  type NotificationChannelType,
  type NotificationConfig,
  type NotificationEventSettings,
} from '../models/SystemConfig';
import GlobalSiteSettings from '../models/GlobalSiteSettings';
import { createLogger } from '../utils/logger';

const logger = createLogger('notification');

export interface NotificationPayload {
  title: string;
  content: string;
  /** Optional markdown content (used by channels that support it) */
  markdown?: string;
  /** Optional absolute HTTP(S) link shown as the notification action. */
  actionUrl?: string;
  actionLabel?: string;
  timestamp?: string;
}

export interface SendResult {
  channel: NotificationChannelType;
  success: boolean;
  message: string;
}

export type NotificationEventType = keyof NotificationEventSettings;

const DEFAULT_EVENT_SETTINGS: NotificationEventSettings = {
  memberRegistration: true,
  knowledgeFeedback: true,
  forumUserRegistered: true,
  forumDiscussionStarted: true,
  forumPostCreated: true,
  forumSkipAdminMod: false,
};
const NOTIFICATION_REQUEST_TIMEOUT_MS = 10_000;

function notificationRequestSignal(): AbortSignal {
  return AbortSignal.timeout(NOTIFICATION_REQUEST_TIMEOUT_MS);
}

function normalizeActionUrl(value?: string): string | undefined {
  if (!value || value.length > 1000) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function markdownWithAction(payload: NotificationPayload): string | undefined {
  if (!payload.markdown) return undefined;
  const actionUrl = normalizeActionUrl(payload.actionUrl);
  return actionUrl ? `${payload.markdown}\n\n[🔗 ${payload.actionLabel || '查看详情'}](${actionUrl})` : payload.markdown;
}

function dingtalkMessageStyle(value: unknown): DingtalkMessageStyle {
  return value === 'actionCard' || value === 'link' ? value : 'markdown';
}

function normalizeDingtalkConfig(config: DingtalkConfig): DingtalkConfig {
  if (config.messageStyle !== undefined && !['markdown', 'actionCard', 'link'].includes(config.messageStyle)) {
    throw new Error('钉钉推送样式无效');
  }
  if (config.imageUrl !== undefined && typeof config.imageUrl !== 'string') {
    throw new Error('钉钉卡片图片 URL 无效');
  }
  const imageUrl = config.imageUrl?.trim() ?? '';
  if (imageUrl && !normalizeActionUrl(imageUrl)) {
    throw new Error('钉钉卡片图片必须是有效的 HTTP(S) URL');
  }
  return {
    ...config,
    messageStyle: dingtalkMessageStyle(config.messageStyle),
    imageUrl,
  };
}

function dingtalkMarkdownBody(payload: NotificationPayload): Record<string, unknown> {
  const markdown = markdownWithAction(payload);
  return markdown
    ? { msgtype: 'markdown', markdown: { title: payload.title, text: `## ${payload.title}\n${markdown}`.replace(/\n/g, '\n\n') } }
    : { msgtype: 'text', text: { content: `${payload.title}\n${payload.content}` } };
}

function dingtalkActionUrl(payload: NotificationPayload): string | undefined {
  return normalizeActionUrl(payload.actionUrl)
    ?? normalizeActionUrl(process.env.FRONTEND_URL)
    ?? normalizeActionUrl(process.env.VITE_APP_URL);
}

/** Build one of DingTalk's native message formats from the shared notification payload. */
export function buildDingtalkMessage(config: DingtalkConfig, payload: NotificationPayload): Record<string, unknown> {
  const style = dingtalkMessageStyle(config.messageStyle);
  if (style === 'markdown') return dingtalkMarkdownBody(payload);

  const actionUrl = dingtalkActionUrl(payload);
  if (!actionUrl) return dingtalkMarkdownBody(payload);

  const imageUrl = normalizeActionUrl(config.imageUrl);
  if (style === 'actionCard') {
    const image = imageUrl ? `![${payload.title}](${imageUrl})\n\n` : '';
    const content = payload.markdown ?? payload.content;
    return {
      msgtype: 'actionCard',
      actionCard: {
        title: payload.title,
        text: `${image}## ${payload.title}\n\n${content}`,
        btnOrientation: '0',
        singleTitle: payload.actionLabel || '查看详情',
        singleURL: actionUrl,
      },
    };
  }

  const summary = payload.content.replace(/\s+/g, ' ').trim().slice(0, 1000);
  return {
    msgtype: 'link',
    link: {
      title: payload.title,
      text: summary,
      ...(imageUrl ? { picUrl: imageUrl } : {}),
      messageUrl: actionUrl,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== Channel senders ====================

/**
 * Send DingTalk robot message
 */
async function sendDingtalk(config: DingtalkConfig, payload: NotificationPayload): Promise<SendResult> {
  const channel: NotificationChannelType = 'dingtalk';
  try {
    let url = config.webhook;
    if (config.secret?.trim()) {
      const timestamp = Date.now();
      const secret = config.secret.trim();
      const stringToSign = `${timestamp}\n${secret}`;
      const hmac = crypto.createHmac('sha256', secret);
      const sign = encodeURIComponent(hmac.update(stringToSign).digest('base64'));
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}timestamp=${timestamp}&sign=${sign}`;
    }

    const body = buildDingtalkMessage(config, payload);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: notificationRequestSignal(),
    });
    const result = (await res.json()) as { errcode?: number; errmsg?: string };

    if (result.errcode === 0) {
      return { channel, success: true, message: 'DingTalk sent' };
    }
    return { channel, success: false, message: result.errmsg ?? 'Unknown error' };
  } catch (err) {
    logger.error({ err }, 'DingTalk send failed');
    return { channel, success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Send WeCom (企业微信) robot message
 */
async function sendWecom(config: WecomConfig, payload: NotificationPayload): Promise<SendResult> {
  const channel: NotificationChannelType = 'wecom';
  try {
    // WeCom markdown: single \n doesn't break lines, use \n\n for paragraphs
    const markdown = markdownWithAction(payload);
    const body = markdown
      ? { msgtype: 'markdown', markdown: { content: `### ${payload.title}\n${markdown}`.replace(/\n/g, '\n\n') } }
      : { msgtype: 'text', text: { content: `${payload.title}\n${payload.content}` } };

    const res = await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: notificationRequestSignal(),
    });
    const result = (await res.json()) as { errcode?: number; errmsg?: string };

    if (result.errcode === 0) {
      return { channel, success: true, message: 'WeCom sent' };
    }
    return { channel, success: false, message: result.errmsg ?? 'Unknown error' };
  } catch (err) {
    logger.error({ err }, 'WeCom send failed');
    return { channel, success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Create a Feishu custom robot signature. Feishu uses the complete
 * "timestamp\nsecret" string as the HMAC key and an empty message body.
 */
export function createFeishuSignature(timestamp: number, secret: string): string {
  return crypto
    .createHmac('sha256', `${timestamp}\n${secret}`)
    .update('')
    .digest('base64');
}

/**
 * Send Feishu group robot message as an interactive card.
 */
async function sendFeishu(config: FeishuConfig, payload: NotificationPayload): Promise<SendResult> {
  const channel: NotificationChannelType = 'feishu';
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const elements: Array<Record<string, unknown>> = [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: payload.markdown ?? payload.content,
        },
      },
    ];
    const actionUrl = normalizeActionUrl(payload.actionUrl);
    if (actionUrl) {
      elements.push({
        tag: 'action',
        actions: [
          {
            tag: 'button',
            type: 'primary',
            text: { tag: 'plain_text', content: payload.actionLabel || '查看详情' },
            url: actionUrl,
          },
        ],
      });
    }

    const body: Record<string, unknown> = {
      msg_type: 'interactive',
      card: {
        header: {
          template: 'blue',
          title: { tag: 'plain_text', content: payload.title },
        },
        elements,
      },
    };

    if (config.secret?.trim()) {
      body.timestamp = String(timestamp);
      body.sign = createFeishuSignature(timestamp, config.secret.trim());
    }

    const res = await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: notificationRequestSignal(),
    });
    const result = (await res.json()) as {
      code?: number;
      msg?: string;
      StatusCode?: number;
      StatusMessage?: string;
    };
    const code = result.code ?? result.StatusCode;

    if (res.ok && code === 0) {
      return { channel, success: true, message: '飞书消息已发送' };
    }
    return {
      channel,
      success: false,
      message: result.msg ?? result.StatusMessage ?? `飞书接口返回 ${res.status}`,
    };
  } catch (err) {
    logger.error({ err }, 'Feishu send failed');
    return { channel, success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Build ServerChan API URL based on key format:
 * - ServerChan3 (uid provided): https://<uid>.push.ft07.com/send/<sendKey>
 * - Turbo SCT key (no uid):     https://sctapi.ftqq.com/<sendKey>.send
 */
function buildServerChanUrl(uid: string, sendKey: string): string {
  if (uid) {
    return `https://${uid}.push.ft07.com/send/${sendKey}`;
  }
  return `https://sctapi.ftqq.com/${sendKey}.send`;
}

/**
 * Send ServerChan message
 * Supports ServerChan3 (uid + sendKey) and Turbo (sendKey only)
 */
async function sendServerChan(config: ServerChanConfig, payload: NotificationPayload): Promise<SendResult> {
  const channel: NotificationChannelType = 'serverchan';
  try {
    const url = buildServerChanUrl(config.uid ?? '', config.sendKey);

    // ServerChan desp field renders Markdown, where single \n doesn't break lines.
    // Convert \n to \n\n (paragraph breaks) for proper line separation.
    const rawDesp = markdownWithAction(payload) ?? payload.content;
    const desp = rawDesp.replace(/\n/g, '\n\n');

    const body = new URLSearchParams({
      title: payload.title,
      desp,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: notificationRequestSignal(),
    });
    const result = (await res.json()) as { code?: number; message?: string };

    if (result.code === 0) {
      return { channel, success: true, message: 'ServerChan sent' };
    }
    return { channel, success: false, message: result.message ?? 'Unknown error' };
  } catch (err) {
    logger.error({ err }, 'ServerChan send failed');
    return { channel, success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Send SMTP email notification
 */
async function sendSmtp(config: SmtpConfig, payload: NotificationPayload): Promise<SendResult> {
  const channel: NotificationChannelType = 'smtp';
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user || config.pass ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: NOTIFICATION_REQUEST_TIMEOUT_MS,
      greetingTimeout: NOTIFICATION_REQUEST_TIMEOUT_MS,
      socketTimeout: NOTIFICATION_REQUEST_TIMEOUT_MS,
    });

    const actionUrl = normalizeActionUrl(payload.actionUrl);
    const htmlContent = escapeHtml(payload.content).replace(/\n/g, '<br>');
    const actionHtml = actionUrl
      ? `<p><a href="${escapeHtml(actionUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(payload.actionLabel || '查看详情')}</a></p>`
      : '';

    await transporter.sendMail({
      from: config.from || config.user,
      to: config.to,
      subject: payload.title,
      text: payload.content,
      html: `<h3>${escapeHtml(payload.title)}</h3><div>${htmlContent}</div>${actionHtml}`,
    });

    return { channel, success: true, message: 'Email sent' };
  } catch (err) {
    logger.error({ err }, 'SMTP send failed');
    return { channel, success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Send generic webhook notification
 */
async function sendWebhook(config: WebhookConfig, payload: NotificationPayload): Promise<SendResult> {
  const channel: NotificationChannelType = 'webhook';
  try {
    // Replace template variables in body, escaping for JSON safety
    let body = config.bodyTemplate || '{"title":"{{title}}","content":"{{content}}","url":"{{url}}"}';
    const safeTitle = payload.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const safeContent = payload.content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const safeUrl = (normalizeActionUrl(payload.actionUrl) ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeTimestamp = String(payload.timestamp || new Date().toISOString()).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    body = body.replace(/\{\{title\}\}/g, safeTitle);
    body = body.replace(/\{\{content\}\}/g, safeContent);
    body = body.replace(/\{\{url\}\}/g, safeUrl);
    body = body.replace(/\{\{timestamp\}\}/g, safeTimestamp);

    // Parse custom headers
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.headers) {
      try {
        headers = { ...headers, ...JSON.parse(config.headers) };
      } catch {
        // Keep default headers if parse fails
      }
    }

    const res = await fetch(config.url, {
      method: config.method,
      headers,
      body: config.method === 'POST' || config.method === 'PUT' ? body : undefined,
      signal: notificationRequestSignal(),
    });

    if (res.ok) {
      return { channel, success: true, message: `Webhook responded ${res.status}` };
    }
    return { channel, success: false, message: `Webhook responded ${res.status}` };
  } catch (err) {
    logger.error({ err }, 'Webhook send failed');
    return { channel, success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ==================== Channel dispatcher ====================

const CHANNEL_SENDERS: Record<
  NotificationChannelType,
  (config: NotificationConfig, payload: NotificationPayload) => Promise<SendResult>
> = {
  dingtalk: (c, p) => sendDingtalk(c as DingtalkConfig, p),
  wecom: (c, p) => sendWecom(c as WecomConfig, p),
  feishu: (c, p) => sendFeishu(c as FeishuConfig, p),
  serverchan: (c, p) => sendServerChan(c as ServerChanConfig, p),
  smtp: (c, p) => sendSmtp(c as SmtpConfig, p),
  webhook: (c, p) => sendWebhook(c as WebhookConfig, p),
};

const ALL_CHANNELS: NotificationChannelType[] = ['dingtalk', 'wecom', 'feishu', 'serverchan', 'smtp', 'webhook'];

// ==================== Public API ====================

class NotificationService {
  async getEventSettings(): Promise<NotificationEventSettings> {
    const stored = (await SystemConfig.getConfig('notification_events')) as Partial<NotificationEventSettings> | null;
    return {
      memberRegistration: stored?.memberRegistration !== false,
      knowledgeFeedback: stored?.knowledgeFeedback !== false,
      forumUserRegistered: stored?.forumUserRegistered !== false,
      forumDiscussionStarted: stored?.forumDiscussionStarted !== false,
      forumPostCreated: stored?.forumPostCreated !== false,
      forumSkipAdminMod: stored?.forumSkipAdminMod === true,
    };
  }

  async updateEventSettings(
    updates: Partial<NotificationEventSettings>,
    updatedBy: string = 'admin'
  ): Promise<NotificationEventSettings> {
    const current = await this.getEventSettings();
    const input = updates && typeof updates === 'object' ? updates : {};
    const settings: NotificationEventSettings = {
      memberRegistration: typeof input.memberRegistration === 'boolean'
        ? input.memberRegistration
        : current.memberRegistration,
      knowledgeFeedback: typeof input.knowledgeFeedback === 'boolean'
        ? input.knowledgeFeedback
        : current.knowledgeFeedback,
      forumUserRegistered: typeof input.forumUserRegistered === 'boolean'
        ? input.forumUserRegistered
        : current.forumUserRegistered,
      forumDiscussionStarted: typeof input.forumDiscussionStarted === 'boolean'
        ? input.forumDiscussionStarted
        : current.forumDiscussionStarted,
      forumPostCreated: typeof input.forumPostCreated === 'boolean'
        ? input.forumPostCreated
        : current.forumPostCreated,
      forumSkipAdminMod: typeof input.forumSkipAdminMod === 'boolean'
        ? input.forumSkipAdminMod
        : current.forumSkipAdminMod,
    };
    const result = await SystemConfig.updateConfig('notification_events', settings, updatedBy);
    return result.config as NotificationEventSettings;
  }

  async isEventEnabled(event: NotificationEventType): Promise<boolean> {
    const settings = await this.getEventSettings();
    return settings[event] ?? DEFAULT_EVENT_SETTINGS[event];
  }

  async notifyEvent(event: NotificationEventType, payload: NotificationPayload): Promise<SendResult[]> {
    if (!(await this.isEventEnabled(event))) return [];
    return this.notifyAll(payload);
  }

  /**
   * Send notification to all enabled channels (parallel, non-blocking)
   */
  async notifyAll(payload: NotificationPayload): Promise<SendResult[]> {
    const results: SendResult[] = [];

    const tasks = ALL_CHANNELS.map(async (channel) => {
      try {
        const config = (await SystemConfig.getConfig(channel)) as NotificationConfig | null;
        if (!config || !('enabled' in config) || !config.enabled) return null;

        const sender = CHANNEL_SENDERS[channel];
        return sender(config, payload);
      } catch (err) {
        logger.error({ err, channel }, 'Channel dispatch error');
        return { channel, success: false, message: 'Dispatch error' } as SendResult;
      }
    });

    const settled = await Promise.allSettled(tasks);
    for (const item of settled) {
      if (item.status === 'fulfilled' && item.value) {
        results.push(item.value);
      }
    }

    logger.info({ results }, 'Notification dispatch complete');
    return results;
  }

  async sendChannel(
    channel: NotificationChannelType,
    config: NotificationConfig,
    payload: NotificationPayload
  ): Promise<SendResult> {
    const sender = CHANNEL_SENDERS[channel];
    if (!sender) return { channel, success: false, message: `Unknown channel: ${channel}` };
    const normalizedConfig = channel === 'dingtalk'
      ? normalizeDingtalkConfig(config as DingtalkConfig)
      : config;
    return sender(normalizedConfig, payload);
  }

  /**
   * Test a specific channel with provided config (does NOT read from DB)
   */
  async testChannel(channel: NotificationChannelType, config: NotificationConfig): Promise<SendResult> {
    const timeDisplay = formatDualTime(null);
    const dt = getDualTime(null);
    const mdTime = dt.local
      ? `⏰ 北京时间: ${dt.beijing}\n🌍 用户当地: ${dt.local} (${dt.localTz})`
      : `⏰ 北京时间: ${dt.beijing}`;
    const testPayload: NotificationPayload = {
      title: '🔧 Test notification',
      content: `Channel "${channel}" is working.\nTime: ${timeDisplay}`,
      markdown: `**Channel**: ${channel}\n**Status**: Connected\n---\n${mdTime}`,
    };

    const sender = CHANNEL_SENDERS[channel];
    if (!sender) {
      return { channel, success: false, message: `Unknown channel: ${channel}` };
    }

    const normalizedConfig = channel === 'dingtalk'
      ? normalizeDingtalkConfig(config as DingtalkConfig)
      : config;
    return sender(normalizedConfig, testPayload);
  }

  /**
   * Get config for a notification channel (with sensitive data masked)
   */
  async getChannelConfig(channel: NotificationChannelType): Promise<NotificationConfig | null> {
    let config = (await SystemConfig.getConfig(channel)) as NotificationConfig | null;
    if (!config) return null;
    if (channel === 'dingtalk') config = normalizeDingtalkConfig(config as DingtalkConfig);
    return this.maskConfig(channel, { ...config });
  }

  /**
   * Get config for editing (unmasked)
   */
  async getChannelConfigForEdit(channel: NotificationChannelType): Promise<NotificationConfig | null> {
    const config = (await SystemConfig.getConfig(channel)) as NotificationConfig | null;
    if (!config) return null;
    return channel === 'dingtalk' ? normalizeDingtalkConfig(config as DingtalkConfig) : config;
  }

  /**
   * Update config for a notification channel
   */
  async updateChannelConfig(
    channel: NotificationChannelType,
    config: NotificationConfig,
    updatedBy: string = 'admin'
  ): Promise<NotificationConfig> {
    const normalizedConfig = channel === 'dingtalk'
      ? normalizeDingtalkConfig(config as DingtalkConfig)
      : config;
    const result = await SystemConfig.updateConfig(channel, normalizedConfig, updatedBy);
    return result.config as NotificationConfig;
  }

  /**
   * Get enabled status of all channels
   */
  async getAllChannelStatus(): Promise<Record<NotificationChannelType, boolean>> {
    const status = {} as Record<NotificationChannelType, boolean>;
    for (const channel of ALL_CHANNELS) {
      const config = (await SystemConfig.getConfig(channel)) as NotificationConfig | null;
      status[channel] = !!config && 'enabled' in config && !!config.enabled;
    }
    return status;
  }

  /**
   * 订阅确认、群发等外发邮件：使用 GlobalSiteSettings.newsletterSmtp（与「消息推送」里的系统通知 SMTP 分离）
   */
  async sendTransactionalEmail(
    to: string | string[],
    subject: string,
    text: string,
    html?: string,
    options?: { replyTo?: string }
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const g = await GlobalSiteSettings.findOne().lean();
      const ns = (g as { newsletterSmtp?: Record<string, unknown> } | null)?.newsletterSmtp;
      const enabled = !!ns?.enabled;
      const host = String(ns?.host || '').trim();
      const user = String(ns?.user || '').trim();
      const pass = String(ns?.pass || '').trim();
      if (!enabled || !host || !user || !pass) {
        return { ok: false, error: 'newsletter_smtp_disabled' };
      }
      const port = typeof ns?.port === 'number' && Number.isFinite(ns.port) ? ns.port : 465;
      const secure = ns?.secure !== false;
      const from = String(ns?.from || '').trim() || user;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      await transporter.sendMail({
        from,
        to,
        ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
        subject,
        text,
        html: html ?? `<pre>${text.replace(/</g, '&lt;')}</pre>`,
      });
      return { ok: true };
    } catch (err) {
      logger.error({ err }, 'Transactional email failed');
      return { ok: false, error: err instanceof Error ? err.message : 'send_failed' };
    }
  }

  /**
   * Mask sensitive fields for display
   */
  private maskConfig(channel: NotificationChannelType, config: NotificationConfig): NotificationConfig {
    const mask = (val: string) => (val ? val.slice(0, 4) + '****' + val.slice(-4) : '');

    switch (channel) {
      case 'dingtalk': {
        const c = config as DingtalkConfig;
        return { ...c, secret: mask(c.secret) };
      }
      case 'feishu': {
        const c = config as FeishuConfig;
        return { ...c, secret: mask(c.secret ?? '') };
      }
      case 'serverchan': {
        const c = config as ServerChanConfig;
        return { ...c, sendKey: mask(c.sendKey) };
      }
      case 'smtp': {
        const c = config as SmtpConfig;
        return { ...c, pass: mask(c.pass) };
      }
      default:
        return config;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
