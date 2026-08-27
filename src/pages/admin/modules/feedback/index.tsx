/**
 * 留言反馈管理模块
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAdminAuth } from '../../hooks'
import FilterChipBar from '@/components/knowledge/FilterChipBar'
import {
  getAllDocumentFeedback,
  addAdminReply,
  removeFeedback,
  removeReply,
  getUnrepliedFeedbackCount,
  type FeedbackWithDocument
} from '@/services/feedbackService'
import {
  KNOWLEDGE_FEEDBACK_SECTIONS,
  type KnowledgeFeedbackSection
} from '@/utils/knowledgeFeedbackSection'

interface FeedbackManagementProps {
  onUnrepliedCountChange?: (count: number) => void
}

type FilterType = 'all' | 'unreplied' | KnowledgeFeedbackSection

const SECTION_I18N: Record<KnowledgeFeedbackSection, string> = {
  wiring: 'knowledge.sections.wiringGuide',
  'installation-video': 'knowledge.sections.videoTutorials',
  'device-operation': 'knowledge.sections.deviceOperationVideos',
  'image-text': 'knowledge.sections.generalDocuments',
  canbus: 'knowledge.sections.canbusSettings'
}

export const FeedbackManagement: React.FC<FeedbackManagementProps> = ({ onUnrepliedCountChange }) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { user: adminUser } = useAdminAuth()

  const [allFeedback, setAllFeedback] = useState<FeedbackWithDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [unrepliedCount, setUnrepliedCount] = useState(0)
  const [filter, setFilter] = useState<FilterType>('all')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; feedbackId: string }>({ open: false, feedbackId: '' })
  const [deleteReplyConfirm, setDeleteReplyConfirm] = useState<{ open: boolean; feedbackId: string; replyId: string }>({
    open: false, feedbackId: '', replyId: ''
  })

  const refreshFeedback = async () => {
    const [data, count] = await Promise.all([
      getAllDocumentFeedback(),
      getUnrepliedFeedbackCount()
    ])
    setAllFeedback(data)
    setUnrepliedCount(count)
    onUnrepliedCountChange?.(count)
  }

  useEffect(() => {
    const loadFeedback = async () => {
      setLoading(true)
      try {
        await refreshFeedback()
      } catch (error) {
        console.error('加载留言失败:', error)
        showToast({
          type: 'error',
          title: '错误',
          description: '加载留言失败'
        })
      } finally {
        setLoading(false)
      }
    }
    loadFeedback()
  }, [showToast, onUnrepliedCountChange])

  const sectionLabel = (section: string) => {
    if (section in SECTION_I18N) {
      return t(SECTION_I18N[section as KnowledgeFeedbackSection])
    }
    return t('knowledge.document')
  }

  const hasAdminReply = (feedback: FeedbackWithDocument) => (
    Boolean(feedback.replies?.some(reply => reply.isAdmin))
  )

  const stats = useMemo(() => {
    const counts: Record<KnowledgeFeedbackSection, number> = {
      wiring: 0,
      'installation-video': 0,
      'device-operation': 0,
      'image-text': 0,
      canbus: 0
    }
    for (const item of allFeedback) {
      const type = item.documentInfo?.type
      if (type && type in counts) {
        counts[type as KnowledgeFeedbackSection] += 1
      }
    }
    return {
      total: allFeedback.length,
      unreplied: unrepliedCount,
      ...counts
    }
  }, [allFeedback, unrepliedCount])

  const filterChips = useMemo(() => ([
    { id: 'all', label: `${t('common.all')} (${stats.total})` },
    { id: 'unreplied', label: `${t('admin.unreplied', { defaultValue: '未回复' })} (${stats.unreplied})` },
    ...KNOWLEDGE_FEEDBACK_SECTIONS.map((section) => ({
      id: section,
      label: `${sectionLabel(section)} (${stats[section]})`
    }))
  ]), [stats, t])

  const filteredFeedback = allFeedback.filter(fb => {
    if (filter === 'all') {
      return true
    }
    if (filter === 'unreplied') {
      return !hasAdminReply(fb)
    }
    return fb.documentInfo?.type === filter
  })

  const handleReply = async (feedbackId: string) => {
    if (!replyContent.trim()) {
      return
    }

    setSubmitting(true)
    try {
      await addAdminReply('', feedbackId, adminUser?.nickname || 'Admin', replyContent)
      await refreshFeedback()
      setReplyingTo(null)
      setReplyContent('')
      showToast({
        type: 'success',
        title: '成功',
        description: '回复成功'
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: '错误',
        description: error instanceof Error ? error.message : ''
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteFeedback = async () => {
    if (!deleteConfirm.feedbackId) {
      return
    }

    setSubmitting(true)
    try {
      await removeFeedback('', deleteConfirm.feedbackId)
      await refreshFeedback()
      setDeleteConfirm({ open: false, feedbackId: '' })
      showToast({
        type: 'success',
        title: '成功',
        description: '删除成功'
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: '错误',
        description: error instanceof Error ? error.message : ''
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteReply = async () => {
    if (!deleteReplyConfirm.feedbackId || !deleteReplyConfirm.replyId) {
      return
    }

    setSubmitting(true)
    try {
      await removeReply('', deleteReplyConfirm.feedbackId, deleteReplyConfirm.replyId)
      await refreshFeedback()
      setDeleteReplyConfirm({ open: false, feedbackId: '', replyId: '' })
      showToast({
        type: 'success',
        title: '成功',
        description: '删除回复成功'
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: '错误',
        description: error instanceof Error ? error.message : ''
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <FilterChipBar
        label={t('knowledge.userFeedback')}
        ariaLabel={t('knowledge.userFeedback')}
        items={filterChips}
        selectedId={filter}
        onSelect={(id) => setFilter(id as FilterType)}
      />

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">{t('common.loading')}</p>
      ) : filteredFeedback.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">{t('knowledge.noUserFeedback')}</p>
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900/40">
          {filteredFeedback.map(feedback => (
            <div key={feedback.id} className="px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800 dark:text-white">{feedback.author}</p>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(feedback.timestamp).toLocaleString()}
                    </span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {sectionLabel(feedback.documentInfo?.type || '')}
                    </span>
                    {!hasAdminReply(feedback) ? (
                      <span className="rounded-full border border-orange-200 px-2 py-0.5 text-xs text-orange-600 dark:border-orange-700 dark:text-orange-400">
                        {t('admin.unreplied', { defaultValue: '未回复' })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                    {feedback.documentInfo?.title}
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">{feedback.content}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {replyingTo === feedback.id ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReplyingTo(feedback.id)}
                    >
                      {t('knowledge.replyAction')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteConfirm({ open: true, feedbackId: feedback.id })}
                    className="text-red-500 hover:text-red-400"
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>

              {feedback.replies && feedback.replies.length > 0 ? (
                <div className="mt-3 space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
                  {feedback.replies.map(reply => (
                    <div key={reply.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{reply.author}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {new Date(reply.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">{reply.content}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteReplyConfirm({
                          open: true,
                          feedbackId: feedback.id,
                          replyId: reply.id
                        })}
                        className="text-red-500 hover:text-red-400"
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {replyingTo === feedback.id ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder={t('knowledge.replyPlaceholder')}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-500 dark:bg-gray-600 dark:text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleReply(feedback.id)
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleReply(feedback.id)}
                      disabled={submitting || !replyContent.trim()}
                    >
                      {submitting ? t('common.loading') : t('knowledge.submitReply')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplyingTo(null)
                        setReplyContent('')
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, feedbackId: '' })}
        onConfirm={handleDeleteFeedback}
        title="删除留言"
        message="确认删除此留言吗？"
        danger
        loading={submitting}
      />

      <ConfirmDialog
        open={deleteReplyConfirm.open}
        onClose={() => setDeleteReplyConfirm({ open: false, feedbackId: '', replyId: '' })}
        onConfirm={handleDeleteReply}
        title="删除回复"
        message="确认删除此回复吗？"
        danger
        loading={submitting}
      />
    </div>
  )
}

export default FeedbackManagement
