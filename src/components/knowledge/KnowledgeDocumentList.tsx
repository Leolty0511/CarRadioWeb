import React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface KnowledgeDocumentListItem {
  id: string
  title: string
  description?: string
  meta?: string
  eyebrow?: string
  onClick: () => void
  actions?: React.ReactNode
}

interface KnowledgeDocumentListProps {
  items: KnowledgeDocumentListItem[]
  accent?: 'video' | 'general' | 'structured'
  loading?: boolean
  loadingText?: string
  emptyText: string
  className?: string
}

const accentDot: Record<NonNullable<KnowledgeDocumentListProps['accent']>, string> = {
  video: 'bg-emerald-500',
  general: 'bg-violet-500',
  structured: 'bg-cyan-500',
}

const KnowledgeDocumentList: React.FC<KnowledgeDocumentListProps> = ({
  items,
  accent = 'general',
  loading = false,
  loadingText,
  emptyText,
  className = ''
}) => {
  if (loading) {
    return (
      <div className={cn('py-12 text-center text-slate-500 dark:text-gray-400', className)}>
        {loadingText}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className={cn('py-12 text-center text-sm text-slate-500 dark:text-gray-400', className)}>
        {emptyText}
      </p>
    )
  }

  return (
    <div className={cn('divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900/40', className)}>
      {items.map((item) => {
        const body = (
          <>
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', accentDot[accent])} />
            <span className="min-w-0 flex-1">
              {item.eyebrow ? (
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {item.eyebrow}
                </span>
              ) : null}
              <span className="block truncate text-base font-semibold text-slate-800 group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-300">
                {item.title}
              </span>
              {item.description ? (
                <span className="mt-1 block truncate text-sm text-slate-500 dark:text-slate-400">
                  {item.description}
                </span>
              ) : null}
            </span>
            {item.meta ? (
              <span className="hidden shrink-0 text-xs text-slate-400 dark:text-slate-500 sm:block">
                {item.meta}
              </span>
            ) : null}
          </>
        )

        if (item.actions) {
          return (
            <div key={item.id} className="group flex w-full items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-4 text-left transition"
                onClick={item.onClick}
              >
                {body}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {item.actions}
              </div>
            </div>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            className="group flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
            onClick={item.onClick}
          >
            {body}
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-cyan-600 dark:text-gray-500" />
          </button>
        )
      })}
    </div>
  )
}

export default KnowledgeDocumentList
