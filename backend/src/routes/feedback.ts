import express from 'express'
import {
  getAllFeedback,
  getPaginatedFeedback,
  createFeedback,
  updateFeedbackStatus,
  deleteFeedback,
  getUnreadFeedbackCount,
  getFeedbackStats,
  exportFeedback,
  clearAllFeedback,
  batchUpdateFeedbackStatus,
  batchDeleteFeedback
} from '../services/feedbackService'
import dingtalkService from '../services/dingtalkService'
import { getClientIP, getGeoWithTimezone, getDualTime, formatDualTime } from '../services/geoLocationService'
import { createLogger } from '../utils/logger'
import GlobalSiteSettings from '../models/GlobalSiteSettings'

const logger = createLogger('feedback-route')
import { notificationService } from '../services/notificationService'
import { authenticateUser, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../config/permissions'
import { createRateLimit } from '../middleware/errorHandler'

const router = express.Router()

// Rate limit: 5 submissions per 15 minutes per IP
const feedbackRateLimit = createRateLimit(15 * 60 * 1000, 5, '反馈提交过于频繁，请15分钟后再试')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 获取所有反馈（按资料体系）- 需要认证
 * 支持分页：?page=1&limit=20&status=pending&search=keyword&startDate=2024-01-01&endDate=2024-12-31
 */
router.get('/', authenticateUser, requirePermission(PERMISSIONS.feedback.read), async (req, res) => {
  try {
    const { page, limit, status, search, startDate, endDate, language } = req.query

    // 如果有分页参数，使用分页查询
    if (page || limit) {
      const result = await getPaginatedFeedback({
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? Math.min(Math.max(parseInt(limit as string, 10), 1), 100) : 20,
        status: status as 'pending' | 'read' | 'replied' | undefined,
        search: search as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        language: language as 'en' | 'ru' | undefined
      })
      return res.json({
        success: true,
        ...result
      })
    }

    // 兼容旧接口：返回所有数据
    const feedback = await getAllFeedback(language as 'en' | 'ru' | undefined)
    return res.json({
      success: true,
      feedback
    })
  } catch (error) {
    logger.error({ error }, '获取反馈失败')
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取反馈失败'
    })
  }
})

/**
 * 创建反馈（需要指定资料体系）
 */
router.post('/', feedbackRateLimit, async (req, res) => {
  try {
    const { name, email, orderNumber, subject, message, userAgent, language } = req.body

    const normalizedOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : ''
    if (!name || !email || !normalizedOrderNumber || !subject || !message) {
      res.status(400).json({
        success: false,
        error: '缺少必要字段'
      })
      return
    }
    const normalizedEmail = typeof email === 'string' ? email.trim() : ''
    if (
      normalizedEmail.length > 254 ||
      normalizedEmail.includes('\r') ||
      normalizedEmail.includes('\n') ||
      !EMAIL_PATTERN.test(normalizedEmail)
    ) {
      res.status(400).json({
        success: false,
        error: 'invalid_email'
      })
      return
    }
    if (normalizedOrderNumber.length < 2 || normalizedOrderNumber.length > 100) {
      res.status(400).json({
        success: false,
        error: 'invalid_order_number'
      })
      return
    }
    
    // 默认使用 'en' 如果没有指定 language
    const feedbackLanguage = (language && ['en', 'ru'].includes(language)) ? language : 'en'

    // 获取真实客户端 IP
    const clientIP = getClientIP(req)

    const feedback = await createFeedback({
      name,
      email: normalizedEmail,
      orderNumber: normalizedOrderNumber,
      subject,
      message,
      ip: clientIP,
      userAgent,
      language: feedbackLanguage
    })

    // 获取用户位置和时区信息（基于IP）
    const geo = await getGeoWithTimezone(clientIP);
    const timeDisplay = formatDualTime(geo.timezone);
    const dt = getDualTime(geo.timezone);

    // Build markdown time block (two lines)
    const mdTime = dt.local
      ? `⏰ 北京时间: ${dt.beijing}\n🌍 用户当地: ${dt.local} (${dt.localTz})`
      : `⏰ 北京时间: ${dt.beijing}`;

    // Send notification to all enabled channels (async, non-blocking)
    notificationService.notifyAll({
      title: `🔔 新的用户反馈`,
      content: `姓名: ${name}\n邮箱: ${email}\n主题: ${subject}\n内容: ${message}\n所在地: ${geo.location}\n时间: ${timeDisplay}`,
      markdown: `### 🔔 新的用户反馈\n**姓名**: ${name}\n**邮箱**: ${email || '未提供'}\n${orderNumber ? `**参考信息**: ${orderNumber}\n` : ''}**主题**: ${subject}\n**所在地**: ${geo.location}\n**内容**:\n${message}\n---\n${mdTime}`,
    }).catch(() => {
      // Silent fail - notification errors should not affect main flow
    })

    // Legacy DingTalk fallback (reads from env vars)
    dingtalkService.notifyFormSubmission({
      type: 'feedback',
      name,
      title: subject,
      content: message,
      email,
      orderNumber,
      location: geo.location,
      timestamp: timeDisplay
    }).catch(() => {
      // 静默处理钉钉发送错误
    })

    // 联系表单邮件通知：使用后台配置的 Newsletter SMTP，发送失败不影响表单提交。
    void (async () => {
      try {
        const settings = await GlobalSiteSettings.findOne().lean() as {
          contactFormEmailEnabled?: boolean
          contactFormEmailTo?: string
          newsletterSmtp?: {
            enabled?: boolean
            user?: string
          }
        } | null
        const smtp = settings?.newsletterSmtp
        if (!settings?.contactFormEmailEnabled || !smtp?.enabled) {
          return
        }

        // 直接发送到 SMTP 登录账号邮箱，确保管理员使用该账号即可接收并回复。
        const recipient = String(smtp.user || settings.contactFormEmailTo || '').trim()
        if (!EMAIL_PATTERN.test(recipient)) {
          logger.warn({ recipient: recipient ? '[configured]' : '[missing]' }, '联系表单邮件未发送：收件地址无效')
          return
        }

        const isRussian = feedbackLanguage === 'ru'
        const mailSubject = isRussian
          ? '[Контактная форма] Новое сообщение клиента'
          : '[Contact form] New customer message'
        const labels = isRussian
          ? {
              intro: 'Получено новое сообщение из контактной формы.',
              name: 'Имя',
              email: 'Электронная почта',
              reference: 'Справочная информация',
              topic: 'Тема',
              content: 'Сообщение',
              location: 'Местоположение',
              time: 'Отправлено',
            }
          : {
              intro: 'A new contact form message has been submitted.',
              name: 'Name',
              email: 'Email',
              reference: 'Reference',
              topic: 'Subject',
              content: 'Message',
              location: 'Location',
              time: 'Submitted at',
            }
        const text = [
          labels.intro,
          '',
          `${labels.name}: ${name}`,
          `${labels.email}: ${normalizedEmail}`,
          `${labels.reference}: ${normalizedOrderNumber}`,
          `${labels.topic}: ${subject}`,
          `${labels.content}:`,
          message,
          '',
          `${labels.location}: ${geo.location}`,
          `${labels.time}: ${timeDisplay}`,
        ].join('\n')
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
            <p>${escapeHtml(labels.intro)}</p>
            <table style="border-collapse:collapse;width:100%;max-width:720px">
              <tbody>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600">${escapeHtml(labels.name)}</td><td style="padding:6px 0">${escapeHtml(name)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600">${escapeHtml(labels.email)}</td><td style="padding:6px 0">${escapeHtml(normalizedEmail)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600">${escapeHtml(labels.reference)}</td><td style="padding:6px 0">${escapeHtml(normalizedOrderNumber)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600">${escapeHtml(labels.topic)}</td><td style="padding:6px 0">${escapeHtml(subject)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top">${escapeHtml(labels.content)}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(message)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600">${escapeHtml(labels.location)}</td><td style="padding:6px 0">${escapeHtml(geo.location)}</td></tr>
                <tr><td style="padding:6px 12px 6px 0;font-weight:600">${escapeHtml(labels.time)}</td><td style="padding:6px 0">${escapeHtml(timeDisplay)}</td></tr>
              </tbody>
            </table>
          </div>
        `
        const result = await notificationService.sendTransactionalEmail(
          recipient,
          mailSubject,
          text,
          html,
          { replyTo: normalizedEmail }
        )
        if (!result.ok) {
          logger.warn({ error: result.error }, '联系表单邮件发送失败')
        }
      } catch (error) {
        logger.error({ error }, '联系表单邮件通知处理失败')
      }
    })()

    res.status(201).json({
      success: true,
      feedback
    })
  } catch (error) {
    logger.error({ error }, '创建反馈失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '创建反馈失败'
    })
  }
})

/**
 * 全量表单状态统计 - 需要认证
 */
router.get('/stats', authenticateUser, requirePermission(PERMISSIONS.feedback.read), async (req, res) => {
  try {
    const language = req.query.language as 'en' | 'ru' | undefined
    const stats = await getFeedbackStats(language)
    res.json({
      success: true,
      stats
    })
  } catch (error) {
    logger.error({ error }, '获取反馈统计失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取反馈统计失败'
    })
  }
})

/**
 * 批量更新反馈状态 - 需要认证
 * 必须在 PUT /:id/status 之前定义，否则 "batch" 会被当作 :id
 */
router.put('/batch/status', authenticateUser, requirePermission(PERMISSIONS.feedback.update), async (req, res) => {
  try {
    const { ids, status } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: '缺少有效的 ids 数组'
      })
      return
    }

    if (!status || !['pending', 'read', 'replied'].includes(status)) {
      res.status(400).json({
        success: false,
        error: '缺少有效的 status 字段'
      })
      return
    }

    const modifiedCount = await batchUpdateFeedbackStatus(ids, status)
    res.json({
      success: true,
      modifiedCount
    })
  } catch (error) {
    logger.error({ error }, '批量更新反馈状态失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '批量更新反馈状态失败'
    })
  }
})

/**
 * 批量删除反馈 - 需要认证
 * 必须在 DELETE /:id 之前定义，否则 "batch" 会被当作 :id
 */
router.delete('/batch', authenticateUser, requirePermission(PERMISSIONS.feedback.delete), async (req, res) => {
  try {
    const { ids } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: '缺少有效的 ids 数组'
      })
      return
    }

    const deletedCount = await batchDeleteFeedback(ids)
    res.json({
      success: true,
      deletedCount
    })
  } catch (error) {
    logger.error({ error }, '批量删除反馈失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '批量删除反馈失败'
    })
  }
})

/**
 * 更新反馈状态 - 需要认证
 */
router.put('/:id/status', authenticateUser, requirePermission(PERMISSIONS.feedback.update), async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const feedback = await updateFeedbackStatus(id, { status })

    res.json({
      success: true,
      feedback
    })
  } catch (error) {
    logger.error({ error }, '更新反馈状态失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '更新反馈状态失败'
    })
  }
})

/**
 * 删除反馈 - 需要认证
 */
router.delete('/:id', authenticateUser, requirePermission(PERMISSIONS.feedback.delete), async (req, res) => {
  try {
    const { id } = req.params

    await deleteFeedback(id)

    res.json({
      success: true,
      message: '反馈删除成功'
    })
  } catch (error) {
    logger.error({ error }, '删除反馈失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除反馈失败'
    })
  }
})

/**
 * 获取未读反馈数量（按资料体系）- 需要认证
 */
router.get('/unread/count', authenticateUser, requirePermission(PERMISSIONS.feedback.read), async (req, res) => {
  try {
    const language = req.query.language as 'en' | 'ru' | undefined
    const count = await getUnreadFeedbackCount(language)
    res.json({
      success: true,
      count
    })
  } catch (error) {
    logger.error({ error }, '获取未读反馈数量失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取未读反馈数量失败'
    })
  }
})

/**
 * 导出反馈数据（按资料体系）- 需要认证
 */
router.get('/export', authenticateUser, requirePermission(PERMISSIONS.feedback.read), async (req, res) => {
  try {
    const language = req.query.language as 'en' | 'ru' | undefined
    const data = await exportFeedback(language)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=feedback-${new Date().toISOString().split('T')[0]}.json`)
    res.send(data)
  } catch (error) {
    logger.error({ error }, '导出反馈失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '导出反馈失败'
    })
  }
})

/**
 * 清空所有反馈（按资料体系）- 需要认证
 */
router.delete('/', authenticateUser, requirePermission(PERMISSIONS.feedback.delete), async (req, res) => {
  try {
    const language = req.query.language as 'en' | 'ru' | undefined
    await clearAllFeedback(language)
    res.json({
      success: true,
      message: '所有反馈已清空'
    })
  } catch (error) {
    logger.error({ error }, '清空反馈失败')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '清空反馈失败'
    })
  }
})

export default router
