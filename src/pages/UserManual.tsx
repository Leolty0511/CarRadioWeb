import React, { useEffect, useState } from 'react'
import { ArrowLeft, Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import SEOHead from '@/components/seo/SEOHead'
import HeadUnitTypeIdentifier from '@/components/knowledge/HeadUnitTypeIdentifier'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'

interface Manual {
  id: string
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
  const { selectedHeadUnitType, selectedHeadUnitTypeId } = useHeadUnitTypes()
  const [manuals, setManuals] = useState<Manual[]>([])
  const [selectedManual, setSelectedManual] = useState<Manual | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoading, setIframeLoading] = useState(false)

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
    setSelectedManual(null)
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

        {selectedManual ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedManual(null)}
              className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-blue-600"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('userManual.backToManuals')}
            </button>
            <div className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{selectedManual.title}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {t('userManual.model')}: {selectedManual.productModel}
                  {selectedManual.version ? ` · ${t('userManual.version')} ${selectedManual.version}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { window.location.href = selectedManual.downloadUrl }}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('userManual.download')}
                </Button>
                <Button variant="outline" onClick={() => window.open(selectedManual.url, '_blank')}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('userManual.openInNewTab')}
                </Button>
              </div>
            </div>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative h-[70vh] min-h-[420px] w-full bg-gray-100 dark:bg-gray-900">
                  {iframeLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                  )}
                  <iframe
                    src={`${selectedManual.url}#toolbar=0&navpanes=0&scrollbar=1`}
                    className="h-full w-full border-0"
                    title={selectedManual.title}
                    onLoad={() => setIframeLoading(false)}
                  />
                </div>
              </CardContent>
            </Card>
          </section>
        ) : (
          <>
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
                    onClick={() => {
                      setSelectedManual(manual)
                      setIframeLoading(true)
                    }}
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
          </>
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
