/**
 * 公告管理模块
 * 完全恢复原有核心功能
 */

import { useState, useEffect } from 'react'
import AnnouncementManager from '@/components/admin/AnnouncementManager'
import { getAnnouncement, updateAnnouncement, toggleAnnouncement } from '@/services/announcementService'
import type { NoticeCardStyle } from '@/services/announcementService'
import { announcementHtmlToPlainText, getAnnouncementHtml } from '@/utils/announcementContent'

import { useToast } from '@/components/ui/Toast'
import type { DataLanguage } from '../../hooks/useDataLanguage'

interface AnnouncementManagementProps {
  dataLanguage: DataLanguage
}

export const AnnouncementManagement: React.FC<AnnouncementManagementProps> = ({ dataLanguage }) => {
  const { showToast } = useToast()

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

  // 加载公告
  useEffect(() => {
    const loadAnnouncement = async () => {
      try {
        const data = await getAnnouncement(dataLanguage)
        if (data) {
          setAnnouncementTitle(data.title || '')
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
        title: '保存成功',
        description: '公告设置已更新'
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: '保存失败',
        description: '无法保存公告设置'
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
        title: newEnabled ? '公告已启用' : '公告已禁用',
        description: ''
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: '操作失败',
        description: '无法切换公告状态'
      })
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
    />
  )
}

export default AnnouncementManagement
