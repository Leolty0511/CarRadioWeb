import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SEOHead from '@/components/seo/SEOHead'
import HeadUnitTypeIdentifier from '@/components/knowledge/HeadUnitTypeIdentifier'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'

interface Software {
  _id: string
  slug?: string
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
  const navigate = useNavigate()
  const { selectedHeadUnitType, selectedHeadUnitTypeId } = useHeadUnitTypes()
  const [software, setSoftware] = useState<Software[]>([])
  const [loading, setLoading] = useState(true)

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
                    onClick={() => navigate(`/software-downloads/${encodeURIComponent(item.slug || item._id)}`)}
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
    </div>
  )
}

export default SoftwareDownloads
