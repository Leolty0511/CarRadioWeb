import { apiClient } from '@/services/apiClient'

export interface AnnouncementStyle {
  type: 'info' | 'warning' | 'danger' | 'success'
  fontSize: 'sm' | 'md' | 'lg'
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textColor?: string
}

/** 公告详情弹窗卡片风格 */
export type NoticeCardStyle = 'glass' | 'scroll' | 'wax' | 'device'

export interface Announcement {
  _id?: string
  language: 'en' | 'ru'
  enabled: boolean
  title?: string
  content: string
  contentHtml?: string
  imageUrl?: string
  style: AnnouncementStyle
  /** 公告详情弹窗样式：玻璃拟态 / 古风卷轴 / 火漆封信 */
  noticeCardStyle?: NoticeCardStyle
  /** 服务端维护的「发布时间」，用于详情弹窗日期展示 */
  publishedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface AnnouncementHistoryItem extends Omit<Announcement, 'enabled'> {
  _id: string
  publishedAt: string
}

/**
 * 获取公告设置
 */
export const getAnnouncement = async (language: 'en' | 'ru' = 'en'): Promise<Announcement | null> => {
  try {
    const result = await apiClient.get(`/announcement?language=${language}`)
    if (result.success) {
      return result.announcement
    }
    return null
  } catch {
    return null
  }
}

export const getAnnouncementHistory = async (
  language: 'en' | 'ru' = 'en',
): Promise<AnnouncementHistoryItem[]> => {
  try {
    const result = await apiClient.get(`/announcement/history?language=${language}`)
    return result.success && Array.isArray(result.announcements) ? result.announcements : []
  } catch {
    return []
  }
}

export const clearAnnouncementHistory = async (language: 'en' | 'ru'): Promise<number> => {
  const result = await apiClient.delete(`/announcement/history?language=${language}`)
  if (!result.success) {throw new Error(result.error || 'announcement_history_clear_failed')}
  return Number(result.deletedCount || 0)
}

/**
 * 更新公告设置
 */
export const updateAnnouncement = async (language: 'en' | 'ru', announcement: Partial<Announcement>): Promise<Announcement | null> => {
  const result = await apiClient.put('/announcement', { language, ...announcement })
  if (result.success) {
    return result.announcement
  }
  throw new Error(result.error || '更新失败')
}

/**
 * 切换公告启用状态
 */
export const toggleAnnouncement = async (language: 'en' | 'ru', enabled: boolean): Promise<Announcement | null> => {
  const result = await apiClient.patch('/announcement/toggle', { language, enabled })
  if (result.success) {
    return result.announcement
  }
  throw new Error(result.error || '切换失败')
}

const ANNOUNCEMENT_READ_KEY = 'announcement_read_v2'
const READ_STATE_RETENTION_MS = 93 * 24 * 60 * 60 * 1000

type AnnouncementReadState = Record<string, number>

function getReadState(language: 'en' | 'ru'): AnnouncementReadState {
  try {
    const raw = localStorage.getItem(`${ANNOUNCEMENT_READ_KEY}_${language}`)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const now = Date.now()
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, value]) => typeof value === 'number' && now - value <= READ_STATE_RETENTION_MS),
        ) as AnnouncementReadState
      }
    }

    // The previous implementation stored one raw version string rather than JSON.
    const legacyVersion = localStorage.getItem(`announcement_read_v1_${language}`)
    if (legacyVersion) {
      return {[legacyVersion]: Date.now()}
    }
  } catch {
    // Ignore malformed or unavailable browser storage.
  }
  return {}
}

function saveReadState(language: 'en' | 'ru', state: AnnouncementReadState): void {
  try {
    localStorage.setItem(`${ANNOUNCEMENT_READ_KEY}_${language}`, JSON.stringify(state))
  } catch {
    // Ignore unavailable browser storage.
  }
}

export const isAnnouncementRead = (
  language: 'en' | 'ru' = 'en',
  currentUpdatedAt?: string
): boolean => {
  if (!currentUpdatedAt) {return false}
  return Object.prototype.hasOwnProperty.call(getReadState(language), currentUpdatedAt)
}

export const markAnnouncementRead = (
  language: 'en' | 'ru' = 'en',
  announcementUpdatedAt?: string
): void => {
  if (!announcementUpdatedAt) {return}
  const state = getReadState(language)
  state[announcementUpdatedAt] = Date.now()
  saveReadState(language, state)
}

/**
 * 清除关闭记录
 */
export const clearAnnouncementClosed = (): void => {
  try {
    localStorage.removeItem(`${ANNOUNCEMENT_READ_KEY}_en`)
    localStorage.removeItem(`${ANNOUNCEMENT_READ_KEY}_ru`)
    // Remove the marker used by the previous implementation as well.
    localStorage.removeItem('announcement_read_v1_en')
    localStorage.removeItem('announcement_read_v1_ru')
  } catch {
    // ignore
  }
}
