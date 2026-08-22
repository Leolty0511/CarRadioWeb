import React, { useEffect, useState } from 'react'
import { AlertTriangle, Download, ExternalLink, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SEOHead from '@/components/seo/SEOHead'
import HeadUnitTypeIdentifier from '@/components/knowledge/HeadUnitTypeIdentifier'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'

interface Software {
  _id: string
  name: string
  description: string
  downloadUrl: string
  importantNote: string
  headUnitTypeId?: string | null
  createdAt: string
  updatedAt: string
}

const SoftwareDownloads: React.FC = () => {
  const { t } = useTranslation()
  const { selectedHeadUnitType, selectedHeadUnitTypeId } = useHeadUnitTypes()
  const [software, setSoftware] = useState<Software[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSoftware, setSelectedSoftware] = useState<Software | null>(null)

  useEffect(() => {
    const loadSoftware = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (selectedHeadUnitTypeId) {params.set('headUnitTypeId', selectedHeadUnitTypeId)}
        const query = params.toString()
        const response = await fetch(query ? `/api/software?${query}` : '/api/software')
        const data = await response.json()
        if (data.success && data.data) {
          setSoftware(data.data.items || [])
        }
      } catch (error) {
        console.error('Failed to load software list:', error)
        setSoftware([])
      } finally {
        setLoading(false)
      }
    }
    void loadSoftware()
    setSelectedSoftware(null)
  }, [selectedHeadUnitTypeId])

  const handleDownload = (item: Software) => {
    window.open(item.downloadUrl, '_blank')
  }

  return (
    <div className="page-container">
      <SEOHead pageKey="software-downloads" />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">
            {t('softwareDownloads.title')}
          </h1>
        </header>

        <section className="mb-10 flex flex-col gap-4 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-5 dark:border-cyan-900/60 dark:bg-cyan-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-left">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">
              {t('knowledge.headUnitTypeSelectorTitle')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-gray-300">
              {selectedHeadUnitType
                ? `${t('knowledge.currentHeadUnitType')}: ${selectedHeadUnitType.name}`
                : t('knowledge.resourceSoftwareHeadUnitTypeHint')}
            </p>
          </div>
          <HeadUnitTypeIdentifier compact className="shrink-0" />
        </section>

        {loading ? (
          <div className="py-20 text-center text-slate-500 dark:text-gray-400">
            {t('common.loading')}
          </div>
        ) : software.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-gray-700">
            <Download className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-gray-600" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
              {t('softwareDownloads.noSoftware')}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-gray-400">
              {t('softwareDownloads.noSoftwareDesc')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {software.map(item => (
              <article
                key={item._id}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start gap-3">
                  <Download className="mt-1 h-5 w-5 flex-none text-cyan-600 dark:text-cyan-400" />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-800 dark:text-white">{item.name}</h2>
                    {item.description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-gray-300">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                {item.importantNote && (
                  <p className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    {item.importantNote}
                  </p>
                )}
                <div className="mt-auto flex gap-2 pt-5">
                  <button
                    type="button"
                    onClick={() => setSelectedSoftware(item)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {t('softwareDownloads.viewDetails')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(item)}
                    className="flex-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-400"
                  >
                    {t('softwareDownloads.download')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selectedSoftware && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSoftware(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-200 p-6 dark:border-gray-700">
              <div>
                <h2 className="pr-4 text-2xl font-bold text-slate-800 dark:text-white">{selectedSoftware.name}</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                  {selectedHeadUnitType
                    ? `${t('knowledge.currentHeadUnitType')}: ${selectedHeadUnitType.name}`
                    : t('softwareDownloads.commonResource')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSoftware(null)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-white"
                aria-label={t('softwareDownloads.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-190px)] overflow-y-auto p-6">
              <p className="whitespace-pre-wrap text-base leading-7 text-slate-600 dark:text-gray-300">
                {selectedSoftware.description}
              </p>
              {selectedSoftware.importantNote && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600 dark:text-amber-400" />
                    <p className="text-sm leading-6 text-amber-700 dark:text-amber-200">{selectedSoftware.importantNote}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50 sm:flex-row">
              <button
                type="button"
                onClick={() => handleDownload(selectedSoftware)}
                className="flex-1 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-400"
              >
                {t('softwareDownloads.download')}
              </button>
              <button
                type="button"
                onClick={() => window.open(selectedSoftware.downloadUrl, '_blank')}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ExternalLink className="mr-2 inline h-4 w-4" />
                {t('softwareDownloads.openInNewTab')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SoftwareDownloads
