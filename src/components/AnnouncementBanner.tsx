import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Check, ChevronRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Announcement,
  AnnouncementHistoryItem,
  isAnnouncementRead,
  markAnnouncementRead,
} from '@/services/announcementService'
import { AnnouncementNoticeCard } from '@/components/announcement/AnnouncementNoticeCard'
import { useSiteSettings } from '@/contexts/SiteSettingsContext'

interface AnnouncementBannerProps {
  announcement: Announcement | null
  history: AnnouncementHistoryItem[]
}

type AnnouncementItem = Announcement | AnnouncementHistoryItem

const ACCENT_COLORS = {
  info: '#38bdf8',
  warning: '#f59e0b',
  danger: '#ef4444',
  success: '#22c55e',
} as const

const FONT_SIZES = {
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
} as const

function getItemVersion(item: AnnouncementItem): string {
  return item.publishedAt || item.updatedAt || item.createdAt || item._id || ''
}

function getItemTitle(item: AnnouncementItem, fallback: string): string {
  const configured = String(item.title || '').trim()
  if (configured) {return configured}
  return String(item.content || '').split(/\r?\n/).find(Boolean)?.trim().slice(0, 90) || fallback
}

function formatRelativeDate(value: string | undefined, language: string, fallback: string): string {
  if (!value) {return fallback}
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) {return fallback}
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000))
  if (language.startsWith('zh')) {return days === 0 ? '今天' : `${days}天前`}
  if (days === 0) {return 'Today'}
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

function formatDate(value: string | undefined, language: string): string {
  if (!value) {return ''}
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {return ''}
  return date.toLocaleString(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ announcement, history }) => {
  const { t, i18n } = useTranslation()
  const { siteSettings } = useSiteSettings()
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<AnnouncementItem | null>(null)

  useEffect(() => {
    if (!panelOpen && !selected) {return}
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {return}
      if (selected) {setSelected(null)}
      else {setPanelOpen(false)}
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [panelOpen, selected])

  const items = useMemo<AnnouncementItem[]>(() => {
    const existing = new Set<string>()
    const result: AnnouncementItem[] = []
    for (const item of history) {
      const key = getItemVersion(item)
      if (!key || existing.has(key)) {continue}
      existing.add(key)
      result.push(item)
    }
    if (announcement?.enabled) {
      const key = getItemVersion(announcement)
      if (!existing.has(key)) {result.unshift(announcement)}
    }
    return result.sort((left, right) => {
      const leftTime = new Date(left.publishedAt || left.updatedAt || left.createdAt || 0).getTime()
      const rightTime = new Date(right.publishedAt || right.updatedAt || right.createdAt || 0).getTime()
      return rightTime - leftTime
    })
  }, [announcement, history])

  const latest = items[0]
  const unread = Boolean(latest && !isAnnouncementRead(latest.language, getItemVersion(latest)))
  const teamName = `${(siteSettings.siteName || siteSettings.logoText || 'Team').trim()} Team`
  const defaultTitle = t('announcement.defaultTitle', 'Announcement')

  const openItem = (item: AnnouncementItem) => {
    markAnnouncementRead(item.language, getItemVersion(item))
    setSelected(item)
    setPanelOpen(false)
  }

  if (!latest) {return null}

  const selectedStyle = selected?.style || latest.style
  const selectedTextStyle: React.CSSProperties = {
    fontSize: FONT_SIZES[selectedStyle.fontSize] || FONT_SIZES.md,
    fontWeight: selectedStyle.fontWeight === 'bold' ? 700 : 400,
    fontStyle: selectedStyle.fontStyle === 'italic' ? 'italic' : 'normal',
    ...(selectedStyle.textColor ? { color: selectedStyle.textColor } : {}),
  }
  const selectedAccent = ACCENT_COLORS[selectedStyle.type] || ACCENT_COLORS.info
  const selectedDate = selected?.publishedAt || selected?.updatedAt || selected?.createdAt

  const overlay = typeof document === 'undefined' ? null : createPortal(
    <>
      {panelOpen && (
        <div className="fixed inset-0 z-[90] bg-slate-950/35" onClick={() => setPanelOpen(false)} aria-hidden="true" />
      )}
      {panelOpen && (
        <aside
          className="announcement-center-panel fixed right-0 top-0 z-[100] flex h-full w-full max-w-[520px] flex-col border-l border-slate-700 bg-slate-900 text-white shadow-2xl"
          aria-label={t('announcement.historyTitle', 'Announcements')}
        >
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30"><Bell className="h-5 w-5" /></span>
              <h2 className="text-xl font-semibold">{t('announcement.historyTitle', 'Announcements')}</h2>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label={t('common.close', 'Close')}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.map((item, index) => {
              const itemVersion = getItemVersion(item)
              const itemUnread = !isAnnouncementRead(item.language, itemVersion)
              return (
                <button
                  type="button"
                  key={`${itemVersion}-${index}`}
                  onClick={() => openItem(item)}
                  className="flex w-full items-center gap-4 border-b border-slate-700 px-6 py-5 text-left transition hover:bg-slate-800"
                >
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${itemUnread ? 'bg-blue-500/25 text-blue-300' : 'bg-slate-700 text-slate-400'}`}>
                    {itemUnread ? <Bell className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-100">{getItemTitle(item, defaultTitle)}</span>
                    <span className="mt-1 block text-xs text-slate-400">{formatRelativeDate(item.publishedAt || item.updatedAt || item.createdAt, i18n.language, t('common.unknown', 'Unknown'))}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-500" />
                </button>
              )
            })}
          </div>
        </aside>
      )}
      {selected && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)} role="dialog" aria-modal="true" aria-label={getItemTitle(selected, defaultTitle)}>
          <div className="w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto relative" onClick={(event) => event.stopPropagation()}>
            <AnnouncementNoticeCard
              style={selected.noticeCardStyle || 'glass'}
              title={getItemTitle(selected, defaultTitle)}
              content={selected.content}
              contentHtml={selected.contentHtml}
              imageUrl={selected.imageUrl}
              teamName={teamName}
              dateText={formatDate(selectedDate, i18n.language)}
              onClose={() => setSelected(null)}
              gotItLabel={t('announcement.gotIt', 'Got it')}
              importantNoticeLabel={t('announcement.importantNotice')}
              sincerelyLabel={t('announcement.sincerely')}
              sealMarkLabel={t('announcement.sealMark')}
              waxSealChar={t('announcement.waxSealChar')}
              newLabel={t('announcement.new')}
              deviceBrandLabel={t('announcement.deviceBrand')}
              micLabel={t('announcement.mic')}
              resetLabel={t('announcement.reset')}
              contentStyle={selectedTextStyle}
              accentColor={selectedAccent}
            />
          </div>
        </div>
      )}
    </>,
    document.body,
  )

  return (
    <>
      <button
        type="button"
        className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-gray-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        onClick={() => setPanelOpen(true)}
        aria-label={t('announcement.open', 'Open announcements')}
        aria-expanded={panelOpen}
        title={t('announcement.open', 'Open announcements')}
      >
        <Bell className="h-5 w-5" />
        {unread && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500 dark:border-slate-900" aria-label={t('announcement.unread', 'Unread')} />}
      </button>
      {overlay}
    </>
  )
}

export default AnnouncementBanner
