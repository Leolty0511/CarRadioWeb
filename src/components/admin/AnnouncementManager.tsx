import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Info, AlertTriangle, CheckCircle, Download, FileText, Palette, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import ImagePicker from '@/components/ImagePicker'
import LazyRichTextEditor from '@/components/LazyRichTextEditor'
import type { NoticeCardStyle } from '@/services/announcementService'
import { getAnnouncementDisplayTitle, getAnnouncementHtml } from '@/utils/announcementContent'
import { AnnouncementNoticeCard } from '@/components/announcement/AnnouncementNoticeCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const MAX_ANNOUNCEMENT_LENGTH = 5000

interface AnnouncementManagerProps {
  announcementTitle: string
  setAnnouncementTitle: (title: string) => void
  announcementContent: string
  announcementContentHtml: string
  setAnnouncementContentHtml: (content: string) => void
  announcementEnabled: boolean
  announcementType: 'info' | 'warning' | 'danger' | 'success'
  setAnnouncementType: (type: 'info' | 'warning' | 'danger' | 'success') => void
  announcementFontSize: 'sm' | 'md' | 'lg'
  setAnnouncementFontSize: (size: 'sm' | 'md' | 'lg') => void
  announcementFontWeight: 'normal' | 'bold'
  setAnnouncementFontWeight: (weight: 'normal' | 'bold') => void
  announcementFontStyle: 'normal' | 'italic'
  setAnnouncementFontStyle: (style: 'normal' | 'italic') => void
  announcementTextColor: string
  setAnnouncementTextColor: (color: string) => void
  /** 公告详情弹窗卡片风格：玻璃拟态 / 古风卷轴 / 火漆封信 */
  noticeCardStyle: NoticeCardStyle
  setNoticeCardStyle: (style: NoticeCardStyle) => void
  announcementImageUrl: string
  setAnnouncementImageUrl: (url: string) => void
  handleToggleAnnouncement: () => void
  handleSaveAnnouncement: () => void
  handleClearHistory: () => void
  clearingHistory: boolean
}

const THEME_STYLES = {
  info: { active: 'border-blue-500 bg-blue-600 text-white shadow-md', accent: '#38bdf8' },
  warning: { active: 'border-amber-500 bg-amber-500 text-white shadow-md', accent: '#f59e0b' },
  danger: { active: 'border-red-500 bg-red-600 text-white shadow-md', accent: '#ef4444' },
  success: { active: 'border-emerald-500 bg-emerald-600 text-white shadow-md', accent: '#22c55e' },
} as const

const FONT_SIZE_STYLES = { sm: '0.875rem', md: '1rem', lg: '1.125rem' } as const

const AnnouncementManager: React.FC<AnnouncementManagerProps> = ({
  announcementTitle,
  setAnnouncementTitle,
  announcementContent,
  announcementContentHtml,
  setAnnouncementContentHtml,
  announcementEnabled,
  announcementType,
  setAnnouncementType,
  announcementFontSize,
  setAnnouncementFontSize,
  announcementFontWeight,
  setAnnouncementFontWeight,
  announcementFontStyle,
  setAnnouncementFontStyle,
  announcementTextColor,
  setAnnouncementTextColor,
  noticeCardStyle,
  setNoticeCardStyle,
  announcementImageUrl,
  setAnnouncementImageUrl,
  handleToggleAnnouncement,
  handleSaveAnnouncement,
  handleClearHistory,
  clearingHistory,
}) => {
  const { t } = useTranslation()
  type TabKey = 'content' | 'style'
  const [activeTab, setActiveTab] = useState<TabKey>('content')
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const previewTitle = getAnnouncementDisplayTitle(
    announcementTitle,
    announcementContent,
    t('announcement.defaultTitle', 'Announcement'),
  )
  const previewContentStyle: React.CSSProperties = {
    fontSize: FONT_SIZE_STYLES[announcementFontSize],
    fontWeight: announcementFontWeight === 'bold' ? 700 : 400,
    fontStyle: announcementFontStyle,
    ...(announcementTextColor ? { color: announcementTextColor } : {}),
  }

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'content', label: t('admin.announcement.sectionContent', '公告内容与图片'), icon: FileText },
    { key: 'style', label: t('admin.announcement.sectionStyle', '显示样式与预览'), icon: Palette },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('admin.announcement.title')}</h2>
          <p className="text-slate-600 dark:text-gray-400 mt-1">{t('admin.announcement.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-slate-600 dark:text-gray-400">{t('admin.announcement.enableLabel')}:</span>
          <button
            onClick={handleToggleAnnouncement}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              announcementEnabled ? 'bg-green-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                announcementEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${announcementEnabled ? 'text-green-500 dark:text-green-400' : 'text-slate-500 dark:text-gray-400'}`}>
            {announcementEnabled ? t('admin.announcement.enabled') : t('admin.announcement.disabled')}
          </span>
        </div>
      </div>

      {/* 导航 Tab（与消息推送一致） */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-gray-700 pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab 1：公告内容与图片 */}
      {activeTab === 'content' && (
      <Card className="bg-white/80 dark:bg-gray-800/50 border-slate-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-white">{t('admin.announcement.sectionContent', '公告内容与图片')}</CardTitle>
          <CardDescription className="text-slate-600 dark:text-gray-400">
            {t('admin.announcement.sectionContentDesc', '编辑公告文案，图片可选，仅在点击横幅后的详情弹窗中展示')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.titleLabel', '公告标题')}</label>
            <input
              type="text"
              value={announcementTitle}
              maxLength={160}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
              placeholder={t('admin.announcement.titlePlaceholder', '输入便于在历史记录中识别的标题')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.contentTitle')}</label>
            <LazyRichTextEditor
              value={announcementContentHtml || getAnnouncementHtml(announcementContent)}
              onChange={setAnnouncementContentHtml}
              placeholder={t('admin.announcement.contentPlaceholder')}
              className="bg-white dark:bg-gray-700"
            />
            <p className="text-xs text-slate-500 dark:text-gray-500 mt-2">{announcementContent.length} / {MAX_ANNOUNCEMENT_LENGTH} {t('admin.announcement.characters')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.imageTitle', '公告图片')} <span className="text-slate-400 font-normal">({t('common.optional', '可选')})</span></label>
            <p className="text-xs text-slate-500 dark:text-gray-500 mb-2">{t('admin.announcement.imageDesc', '在详情弹窗中展示，不显示在横幅条上')}</p>
            <ImagePicker
              value={announcementImageUrl}
              onChange={setAnnouncementImageUrl}
              uploadFolder="uploads"
              imageType="general"
              placeholder={t('admin.announcement.imagePlaceholder', '点击上传或从图库选择')}
            />
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">{t('admin.announcement.historyCleanup')}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('admin.announcement.historyCleanupDesc')}</p>
            </div>
            <Button type="button" variant="destructive" size="sm" loading={clearingHistory} onClick={() => setClearConfirmOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />{t('admin.announcement.clearHistory')}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Tab 2：显示样式设置 + 预览 */}
      {activeTab === 'style' && (
      <Card className="bg-white/80 dark:bg-gray-800/50 border-slate-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-white">{t('admin.announcement.sectionStyle', '显示样式与预览')}</CardTitle>
          <CardDescription className="text-slate-600 dark:text-gray-400">
            {t('admin.announcement.previewDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 样式设置 */}
            <div className="space-y-4">
              {/* 主题选择 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-3">{t('admin.announcement.theme')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'info' as const, label: t('admin.announcement.themeInfo'), icon: Info },
                    { type: 'warning' as const, label: t('admin.announcement.themeWarning'), icon: AlertTriangle },
                    { type: 'danger' as const, label: t('admin.announcement.themeDanger'), icon: Bell },
                    { type: 'success' as const, label: t('admin.announcement.themeSuccess'), icon: CheckCircle }
                  ].map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      onClick={() => setAnnouncementType(type)}
                      className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all ${
                        announcementType === type
                          ? THEME_STYLES[type].active
                          : 'bg-slate-100 dark:bg-gray-700/50 border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:border-slate-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 文字格式 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.fontSize')}</label>
                  <select
                    value={announcementFontSize}
                    onChange={(e) => setAnnouncementFontSize(e.target.value as 'sm' | 'md' | 'lg')}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white [&>option]:bg-white [&>option]:dark:bg-gray-700 [&>option]:text-slate-800 [&>option]:dark:text-white"
                  >
                    <option value="sm">{t('admin.announcement.fontSizeSmall')}</option>
                    <option value="md">{t('admin.announcement.fontSizeMedium')}</option>
                    <option value="lg">{t('admin.announcement.fontSizeLarge')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.fontWeight')}</label>
                  <select
                    value={announcementFontWeight}
                    onChange={(e) => setAnnouncementFontWeight(e.target.value as 'normal' | 'bold')}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white [&>option]:bg-white [&>option]:dark:bg-gray-700 [&>option]:text-slate-800 [&>option]:dark:text-white"
                  >
                    <option value="normal">{t('admin.announcement.fontWeightNormal')}</option>
                    <option value="bold">{t('admin.announcement.fontWeightBold')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.fontStyle')}</label>
                  <select
                    value={announcementFontStyle}
                    onChange={(e) => setAnnouncementFontStyle(e.target.value as 'normal' | 'italic')}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white [&>option]:bg-white [&>option]:dark:bg-gray-700 [&>option]:text-slate-800 [&>option]:dark:text-white"
                  >
                    <option value="normal">{t('admin.announcement.fontStyleNormal')}</option>
                    <option value="italic">{t('admin.announcement.fontStyleItalic')}</option>
                  </select>
                </div>
              </div>

              {/* 公告详情卡片风格 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">
                  {t('admin.announcement.noticeCardStyle') || '公告详情展示风格'}
                </label>
                <select
                  value={noticeCardStyle}
                  onChange={(e) => setNoticeCardStyle(e.target.value as NoticeCardStyle)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white [&>option]:bg-white [&>option]:dark:bg-gray-700 [&>option]:text-slate-800 [&>option]:dark:text-white"
                >
                  <option value="glass">{t('admin.announcement.noticeStyleGlass') || '玻璃拟态'}</option>
                  <option value="scroll">{t('admin.announcement.noticeStyleScroll') || '古风卷轴'}</option>
                  <option value="wax">{t('admin.announcement.noticeStyleWax') || '火漆封信'}</option>
                  <option value="device">{t('admin.announcement.noticeStyleDevice') || 'CarRadio 车机屏幕'}</option>
                </select>
              </div>

              {/* 自定义颜色 */}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{t('admin.announcement.customColor')}</label>
                <div className="flex space-x-2">
                  <input
                    type="color"
                    value={announcementTextColor || '#ffffff'}
                    onChange={(e) => setAnnouncementTextColor(e.target.value)}
                    className="w-12 h-10 rounded border border-slate-300 dark:border-gray-600 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={announcementTextColor}
                    onChange={(e) => setAnnouncementTextColor(e.target.value)}
                    placeholder="#ffffff"
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white"
                  />
                  {announcementTextColor && (
                    <Button
                      variant="outline"
                      onClick={() => setAnnouncementTextColor('')}
                      className="border-slate-300 dark:border-gray-600"
                    >
                      {t('common.clear')}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 预览 */}
            <div className="lg:sticky lg:top-6 self-start">
              {announcementContent ? (
                <div className="mt-5">
                  <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">{t('admin.announcement.detailPreview')}</p>
                  <div className="overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-950/40">
                    <AnnouncementNoticeCard
                      style={noticeCardStyle}
                      title={previewTitle}
                      content={announcementContent}
                      contentHtml={announcementContentHtml}
                      imageUrl={announcementImageUrl}
                      teamName="CarRadio Team"
                      dateText={new Date().toLocaleDateString()}
                      onClose={() => undefined}
                      gotItLabel={t('announcement.gotIt')}
                      importantNoticeLabel={t('announcement.importantNotice')}
                      sincerelyLabel={t('announcement.sincerely')}
                      sealMarkLabel={t('announcement.sealMark')}
                      waxSealChar={t('announcement.waxSealChar')}
                      newLabel={t('announcement.new')}
                      deviceBrandLabel={t('announcement.deviceBrand')}
                      micLabel={t('announcement.mic')}
                      resetLabel={t('announcement.reset')}
                      contentStyle={previewContentStyle}
                      accentColor={THEME_STYLES[announcementType].accent}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-gray-600 py-10 text-center text-slate-500 dark:text-gray-500 text-sm">
                  {t('admin.announcement.noContent')}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* 保存（当前 Tab 内展示） */}
      <div className="pt-2">
        <Button
          onClick={handleSaveAnnouncement}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          disabled={!announcementContent.trim()}
        >
          <Download className="h-4 w-4 mr-2" />
          {t('common.save')}
        </Button>
      </div>
      <ConfirmDialog
        isOpen={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={handleClearHistory}
        title={t('admin.announcement.clearHistoryConfirmTitle')}
        message={t('admin.announcement.clearHistoryConfirmMessage')}
        confirmText={t('admin.announcement.clearHistory')}
        cancelText={t('common.cancel')}
        type="danger"
      />
    </div>
  )
}

export default AnnouncementManager
