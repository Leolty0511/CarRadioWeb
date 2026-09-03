import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/Card'
import SEOHead from '@/components/seo/SEOHead'
import HeadUnitTypeIdentifier from '@/components/knowledge/HeadUnitTypeIdentifier'
import KnowledgeHomeLink from '@/components/knowledge/KnowledgeHomeLink'
import { useContentHref } from '@/hooks/useContentHref'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'

interface Manual {
  id: string
  slug?: string
  name: string
  title: string
  productModel: string
  description?: string
  version?: string
  sizeFormatted: string
  url: string
  downloadUrl: string
  headUnitTypeId?: string
}

const UserManual: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isPublicGuide, contentHref } = useContentHref()
  const { selectedHeadUnitType, selectedHeadUnitTypeId } = useHeadUnitTypes()
  const [manuals, setManuals] = useState<Manual[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadManuals = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (selectedHeadUnitTypeId) {params.set('headUnitTypeId', selectedHeadUnitTypeId)}
        const query = params.toString()
        const response = await fetch(query ? `/api/user-manual?${query}` : '/api/user-manual')
        const data = await response.json()
        if (data.success) {setManuals(data.manuals || [])}
      } catch (error) {
        console.error(error)
        setManuals([])
    } finally {
        setLoading(false)
      }
    }
    void loadManuals()
  }, [selectedHeadUnitTypeId])

  return (
    <div className="page-container">
      <SEOHead title={t('userManual.title')} description={t('userManual.description')} keywords={['user manual', 'product manual', 'PDF']} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 border-b border-gray-200 pb-7 text-center dark:border-gray-700">
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
            <FileText className="h-4 w-4" />
            {t('userManual.badge')}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('userManual.title')}</h1>
          <p className="mx-auto mt-2 max-w-2xl text-gray-600 dark:text-gray-300">{t('userManual.description')}</p>
        </header>

        {isPublicGuide && <KnowledgeHomeLink className="mb-5" />}

        <section className="mb-8 flex flex-col gap-4 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-5 dark:border-cyan-900/60 dark:bg-cyan-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-left">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">
              {t('knowledge.headUnitTypeSelectorTitle')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-gray-300">
              {selectedHeadUnitType
                ? `${t('knowledge.currentHeadUnitType')}: ${selectedHeadUnitType.name}`
                : t('knowledge.resourceHeadUnitTypeHint')}
            </p>
          </div>
          <HeadUnitTypeIdentifier compact className="shrink-0" />
        </section>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : manuals.length === 0 ? (
          <EmptyState title={t('userManual.noManuals')} description={t('userManual.noManualsDesc')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {manuals.map(manual => (
              <Card
                key={manual.id}
                hoverable
                onClick={() => navigate(contentHref(`/user-manual/${encodeURIComponent(manual.slug || manual.id)}`))}
                className="cursor-pointer"
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <FileText className="h-7 w-7 flex-none text-blue-500" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{manual.title}</h3>
                      <p className="mt-1 text-sm text-gray-500">{t('userManual.model')}: {manual.productModel}</p>
                      {manual.description && <p className="mt-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{manual.description}</p>}
                      <div className="mt-4 flex gap-3 text-xs text-gray-400">
                        <span>{manual.sizeFormatted}</span>
                        {manual.version && <span>{t('userManual.version')} {manual.version}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-700">
      <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  )
}

export default UserManual
