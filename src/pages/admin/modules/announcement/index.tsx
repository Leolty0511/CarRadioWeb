/**
 * 公告管理模块
 * 完全恢复原有核心功能
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import AnnouncementManager from '@/components/admin/AnnouncementManager'
import { clearAnnouncementHistory, getAnnouncement, updateAnnouncement, toggleAnnouncement } from '@/services/announcementService'
import type { NoticeCardStyle } from '@/services/announcementService'
import { announcementHtmlToPlainText, getAnnouncementDisplayTitle, getAnnouncementHtml } from '@/utils/announcementContent'

import { useToast } from '@/components/ui/Toast'
import type { DataLanguage } from '../../hooks/useDataLanguage'

interface AnnouncementManagementProps {
  dataLanguage: DataLanguage
}

export const AnnouncementManagement: React.FC<AnnouncementManagementProps> = ({ dataLanguage }) => {
  const { showToast } = useToast()
  const { t } = useTranslation()

  // 公告状态
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementContent, setAnnouncementContent] = useState('')
  const [announcementContentHtml, setAnnouncementContentHtml] = useState('')
  const [announcementEnabled, setAnnouncementEnabled] = useState(false)
  const [announcementType, setAnnouncementType] = useState<'info' | 'warning' | 'danger' | 'success'>('info')
  const [announcementFontSize, setAnnouncementFontSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [announcementFontWeight, setAnnouncementFontWeight] = useState<'normal' | 'bold'>('normal')
  const [announcementFontStyle, setAnnouncementFontStyle] = useState<'normal' | 'italic'>('normal')
  const [announcementTextColor, setAnnouncementTextColor] = useState('')
  const [noticeCardStyle, setNoticeCardStyle] = useState<NoticeCardStyle>('glass')
  const [announcementImageUrl, setAnnouncementImageUrl] = useState('')
  const [clearingHistory, setClearingHistory] = useState(false)

  // 加载公告
  useEffect(() => {
    const loadAnnouncement = async () => {
      try {
        const data = await getAnnouncement(dataLanguage)
        if (data) {
          setAnnouncementTitle(getAnnouncementDisplayTitle(data.title || '', data.content, ''))
          setAnnouncementContent(data.content)
          setAnnouncementContentHtml(getAnnouncementHtml(data.content, data.contentHtml))
          setAnnouncementEnabled(data.enabled)
          setAnnouncementType(data.style.type)
          setAnnouncementFontSize(data.style.fontSize)
          setAnnouncementFontWeight(data.style.fontWeight)
          setAnnouncementFontStyle(data.style.fontStyle)
          setAnnouncementTextColor(data.style.textColor || '')
          setNoticeCardStyle(data.noticeCardStyle || 'glass')
          setAnnouncementImageUrl(data.imageUrl || '')
        }
      } catch (error) {
        console.error('加载公告失败:', error)
      }
    }
    loadAnnouncement()
  }, [dataLanguage])

  // 保存公告
  const handleSaveAnnouncement = async () => {
    try {
      await updateAnnouncement(dataLanguage, {
        enabled: announcementEnabled,
        title: announcementTitle,
        content: announcementContent,
        contentHtml: announcementContentHtml,
        imageUrl: announcementImageUrl,
        noticeCardStyle,
        style: {
          type: announcementType,
          fontSize: announcementFontSize,
          fontWeight: announcementFontWeight,
          fontStyle: announcementFontStyle,
          textColor: announcementTextColor
        },
      })
      showToast({
        type: 'success',
        title: t('admin.announcement.saveSuccess'),
        description: t('admin.announcement.saveSuccessDesc')
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: t('admin.announcement.saveFailed'),
        description: t('admin.announcement.saveFailedDesc')
      })
    }
  }

  // 切换公告状态
  const handleToggleAnnouncement = async () => {
    try {
      const newEnabled = !announcementEnabled
      await toggleAnnouncement(dataLanguage, newEnabled)
      setAnnouncementEnabled(newEnabled)
      showToast({
        type: 'success',
        title: newEnabled ? t('admin.announcement.enabled') : t('admin.announcement.disabled'),
        description: ''
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: t('admin.announcement.actionFailed'),
        description: t('admin.announcement.toggleFailed')
      })
    }
  }

  const handleClearHistory = async () => {
    setClearingHistory(true)
    try {
      const deletedCount = await clearAnnouncementHistory(dataLanguage)
      showToast({
        type: 'success',
        title: t('admin.announcement.clearHistorySuccess'),
        description: t('admin.announcement.clearHistorySuccessDesc', { count: deletedCount }),
      })
    } catch {
      showToast({ type: 'error', title: t('admin.announcement.clearHistoryFailed'), description: t('admin.announcement.clearHistoryFailedDesc') })
    } finally {
      setClearingHistory(false)
    }
  }

  return (
    <AnnouncementManager
      announcementTitle={announcementTitle}
      setAnnouncementTitle={setAnnouncementTitle}
      announcementContent={announcementContent}
      announcementContentHtml={announcementContentHtml}
      setAnnouncementContentHtml={(html) => {
        setAnnouncementContentHtml(html)
        setAnnouncementContent(announcementHtmlToPlainText(html))
      }}
      announcementEnabled={announcementEnabled}
      announcementType={announcementType}
      setAnnouncementType={setAnnouncementType}
      announcementFontSize={announcementFontSize}
      setAnnouncementFontSize={setAnnouncementFontSize}
      announcementFontWeight={announcementFontWeight}
      setAnnouncementFontWeight={setAnnouncementFontWeight}
      announcementFontStyle={announcementFontStyle}
      setAnnouncementFontStyle={setAnnouncementFontStyle}
      announcementTextColor={announcementTextColor}
      setAnnouncementTextColor={setAnnouncementTextColor}
      noticeCardStyle={noticeCardStyle}
      setNoticeCardStyle={setNoticeCardStyle}
      announcementImageUrl={announcementImageUrl}
      setAnnouncementImageUrl={setAnnouncementImageUrl}
      handleToggleAnnouncement={handleToggleAnnouncement}
      handleSaveAnnouncement={handleSaveAnnouncement}
      handleClearHistory={handleClearHistory}
      clearingHistory={clearingHistory}
    />
  )
}

export default AnnouncementManagement
