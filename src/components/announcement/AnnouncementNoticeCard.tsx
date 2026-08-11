/**
 * 公告详情弹窗卡片 — 三种风格：玻璃拟态 / 古风卷轴 / 火漆封信
 */

import React from 'react'
import { Home, Mail, Power, Radio, Undo2, Volume1, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { NoticeCardStyle } from '@/services/announcementService'
import '@/styles/announcement-notice-cards.css'
import { getAnnouncementHtml } from '@/utils/announcementContent'
import { sanitizeHTMLForReact } from '@/utils/sanitize'

export interface AnnouncementNoticeCardProps {
  style: NoticeCardStyle
  title: string
  content: string
  contentHtml?: string
  imageUrl?: string
  teamName: string
  dateText: string
  onClose: () => void
  gotItLabel: string
  /** 火漆/卷轴风格用：重要通知标题、敬上、印、火漆字「通」— 由父组件传入 i18n 文案 */
  importantNoticeLabel?: string
  sincerelyLabel?: string
  sealMarkLabel?: string
  waxSealChar?: string
  newLabel?: string
  deviceBrandLabel?: string
  micLabel?: string
  resetLabel?: string
}

const DEFAULT_IMPORTANT_NOTICE = '— Important Notice —'
const DEFAULT_SINCERELY = 'Sincerely'
const DEFAULT_SEAL_MARK = 'S'
const DEFAULT_WAX_SEAL_CHAR = 'N'
const DEFAULT_NEW_LABEL = 'NEW'
const DEFAULT_DEVICE_BRAND = 'CarRadio OS'
const DEFAULT_MIC_LABEL = 'MIC'
const DEFAULT_RESET_LABEL = 'RST'

export const AnnouncementNoticeCard: React.FC<AnnouncementNoticeCardProps> = ({
  style,
  title,
  content,
  contentHtml,
  imageUrl,
  teamName,
  dateText,
  onClose,
  gotItLabel,
  importantNoticeLabel = DEFAULT_IMPORTANT_NOTICE,
  sincerelyLabel = DEFAULT_SINCERELY,
  sealMarkLabel = DEFAULT_SEAL_MARK,
  waxSealChar = DEFAULT_WAX_SEAL_CHAR,
  newLabel = DEFAULT_NEW_LABEL,
  deviceBrandLabel = DEFAULT_DEVICE_BRAND,
  micLabel = DEFAULT_MIC_LABEL,
  resetLabel = DEFAULT_RESET_LABEL
}) => {
  const bodyContent = (
    <>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="notice-card-image"
        />
      )}
      <div
        className="notice-card-body-text announcement-rich-content"
        dangerouslySetInnerHTML={sanitizeHTMLForReact(getAnnouncementHtml(content, contentHtml))}
      />
    </>
  )

  if (style === 'glass') {
    return (
      <div className="notice-card notice-card--glass">
        <div className="notice-card__glow" aria-hidden />
        <div className="notice-card__glow-2" aria-hidden />
        <div className="notice-card__top-section">
          <div className="notice-card__notice-icon">
            <Mail className="h-5 w-5" />
          </div>
          <h3 className="notice-card__top-title">{title}</h3>
          <span className="notice-card__badge">{newLabel}</span>
        </div>
        <div className="notice-card__inner">
          {bodyContent}
          <div className="notice-card__footer-bar">
            <span>{dateText} · {teamName}</span>
            <Button onClick={onClose} className="notice-card__action-btn">
              {gotItLabel} →
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (style === 'scroll') {
    return (
      <div className="notice-card notice-card--scroll">
        <div className="notice-card__rod notice-card__rod--top" aria-hidden />
        <div className="notice-card__scroll-body">
          <div className="notice-card__scroll-header">{title}</div>
          {bodyContent}
          <div className="notice-card__scroll-footer">
            {teamName} {sincerelyLabel}<br />{dateText}
          </div>
          <div className="notice-card__seal-mark">{sealMarkLabel}</div>
        </div>
        <div className="notice-card__rod notice-card__rod--bottom" aria-hidden />
        <div className="notice-card__scroll-actions">
          <Button onClick={onClose}>{gotItLabel}</Button>
        </div>
      </div>
    )
  }

  if (style === 'wax') {
    return (
      <div className="notice-card notice-card--wax">
        <div className="notice-card__flap" aria-hidden />
        <div className="notice-card__wax-seal" aria-hidden>
          <span>{waxSealChar}</span>
        </div>
        <div className="notice-card__wax-header">{importantNoticeLabel}</div>
        <div className="notice-card__wax-body">
          {bodyContent}
        </div>
        <div className="notice-card__wax-footer">
          {teamName} {sincerelyLabel}<br />{dateText}
        </div>
        <div className="notice-card__bottom-stripe" aria-hidden />
        <div className="notice-card__wax-actions">
          <Button onClick={onClose}>{gotItLabel}</Button>
        </div>
      </div>
    )
  }

  if (style === 'device') {
    return (
      <div className="notice-card notice-card--device">
        <div className="cr-device">
          <div className="cr-controls" aria-hidden="true">
            <div className="cr-ind"><span className="cr-ind__dot" />{micLabel}</div>
            <div className="cr-ind"><span className="cr-ind__dot" />{resetLabel}</div>
            <div className="cr-btn"><Power /></div>
            <div className="cr-btn"><Home /></div>
            <div className="cr-btn"><Undo2 /></div>
            <div className="cr-btn"><Volume2 /></div>
            <div className="cr-btn"><Volume1 /></div>
          </div>
          <div className="cr-screen">
            <div className="cr-screen__bar">
              <span className="cr-screen__bar-title">
                <Radio aria-hidden="true" />
                {deviceBrandLabel}
              </span>
              <span className="cr-signal" aria-hidden="true"><i /><i /><i /><i /></span>
              <span className="cr-screen__clock">{dateText}</span>
            </div>
            <div className="cr-screen__content">
              <h3 className="cr-title">
                {title}
                <span className="cr-title__pill">{newLabel}</span>
              </h3>
              {bodyContent}
            </div>
            <div className="cr-screen__footer">
              <span className="cr-screen__team">{teamName}</span>
              <Button onClick={onClose} className="cr-btn-got">
                {gotItLabel} <span aria-hidden="true">-&gt;</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default AnnouncementNoticeCard
