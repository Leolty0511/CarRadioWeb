import { Announcement, IAnnouncement } from '../models/Announcement'
import { AnnouncementHistory, IAnnouncementHistory } from '../models/AnnouncementHistory'
import { createLogger } from '../utils/logger'
import { plainTextToAnnouncementHtml, sanitizeAnnouncementHtml } from '../utils/announcementHtml'

const logger = createLogger('announcement-service')
const HISTORY_MONTHS = 3

function historyExpiry(publishedAt: Date): Date {
  const expiresAt = new Date(publishedAt)
  expiresAt.setMonth(expiresAt.getMonth() + HISTORY_MONTHS)
  return expiresAt
}

function announcementTitle(announcement: IAnnouncement): string {
  const configured = String(announcement.title || '').replace(/\s+/g, ' ').trim()
  const content = String(announcement.content || '').replace(/\s+/g, ' ').trim()
  if (configured.length >= 32 && content.startsWith(configured)) return ''
  return configured.slice(0, 160)
}

async function recordPublishedAnnouncement(announcement: IAnnouncement): Promise<void> {
  if (!announcement.enabled || !announcement.content.trim()) return
  const publishedAt = announcement.publishedAt || announcement.updatedAt || new Date()
  await AnnouncementHistory.updateOne(
    { sourceAnnouncementId: announcement._id, publishedAt },
    {
      $setOnInsert: {
        sourceAnnouncementId: announcement._id,
        language: announcement.language,
        title: announcementTitle(announcement),
        content: announcement.content,
        contentHtml: announcement.contentHtml || '',
        imageUrl: announcement.imageUrl || '',
        style: announcement.style,
        noticeCardStyle: announcement.noticeCardStyle || 'glass',
        publishedAt,
        expiresAt: historyExpiry(publishedAt),
      },
    },
    { upsert: true },
  )
}

/**
 * 获取公告设置
 */
export const getAnnouncement = async (language: 'en' | 'ru'): Promise<IAnnouncement | null> => {
  try {
    let announcement = await Announcement.findOne({ language })
    
    if (!announcement) {
      const defaultContent = language === 'en' 
        ? 'Welcome to the site! This is an example announcement.'
        : 'Добро пожаловать на сайт! Это пример объявления.'
      
      announcement = await Announcement.create({
        language,
        enabled: false,
        title: '',
        content: defaultContent,
        contentHtml: plainTextToAnnouncementHtml(defaultContent),
        style: {
          type: 'info',
          fontSize: 'md',
          fontWeight: 'normal',
          fontStyle: 'normal',
          textColor: ''
        },
      })
    }
    
    return announcement
  } catch (error) {
    logger.error({ error }, '获取公告失败')
    throw error
  }
}

/**
 * 更新公告设置
 */
export const updateAnnouncement = async (language: 'en' | 'ru', data: Partial<IAnnouncement>): Promise<IAnnouncement> => {
  try {
    const updateData: Partial<IAnnouncement> = { ...data }
    const incomingHtml = typeof updateData.contentHtml === 'string' ? updateData.contentHtml : ''
    if (incomingHtml) {
      updateData.contentHtml = sanitizeAnnouncementHtml(incomingHtml)
    } else if (typeof updateData.content === 'string') {
      updateData.contentHtml = plainTextToAnnouncementHtml(updateData.content)
    }

    let announcement = await Announcement.findOne({ language })
    const now = new Date()

    if (!announcement) {
      announcement = await Announcement.create({ ...updateData, language, publishedAt: now })
    } else {
      Object.assign(announcement, updateData)
      announcement.publishedAt = now
      await announcement.save()
    }

    await recordPublishedAnnouncement(announcement)

    return announcement
  } catch (error) {
    logger.error({ error }, '更新公告失败')
    throw error
  }
}

/**
 * 切换公告启用状态
 */
export const toggleAnnouncement = async (language: 'en' | 'ru', enabled: boolean): Promise<IAnnouncement> => {
  try {
    const announcement = await Announcement.findOne({ language })
    
    if (!announcement) {
      throw new Error('公告不存在')
    }

    const wasEnabled = announcement.enabled
    announcement.enabled = enabled
    if (!wasEnabled && enabled) {
      announcement.publishedAt = new Date()
    }
    await announcement.save()
    if (enabled) await recordPublishedAnnouncement(announcement)
    
    return announcement
  } catch (error) {
    logger.error({ error }, '切换公告状态失败')
    throw error
  }
}

export const getAnnouncementHistory = async (
  language: 'en' | 'ru',
  limit = 50,
): Promise<IAnnouncementHistory[]> => {
  const current = await Announcement.findOne({ language })
  if (current?.enabled) await recordPublishedAnnouncement(current)

  return AnnouncementHistory.find({
    language,
    expiresAt: { $gt: new Date() },
  })
    .sort({ publishedAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
}

export const clearAnnouncementHistory = async (language: 'en' | 'ru'): Promise<number> => {
  const result = await AnnouncementHistory.deleteMany({ language })
  return result.deletedCount || 0
}
