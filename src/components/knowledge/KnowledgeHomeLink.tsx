import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useContentHref } from '@/hooks/useContentHref'

interface KnowledgeHomeLinkProps {
  className?: string
}

/**
 * 知识库功能页的统一入口，避免用户只能通过顶部导航返回知识库首页。
 */
const KnowledgeHomeLink: React.FC<KnowledgeHomeLinkProps> = ({ className }) => {
  const { t } = useTranslation()
  const { contentHref } = useContentHref()

  return (
    <Link
      to={contentHref('/knowledge')}
      className={cn(
        'inline-flex items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-cyan-400 hover:text-cyan-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-cyan-600 dark:hover:text-cyan-300',
        className
      )}
    >
      {t('knowledge.backToKnowledge')}
    </Link>
  )
}

export default KnowledgeHomeLink
