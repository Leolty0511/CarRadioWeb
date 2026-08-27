import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import SEOHead from '@/components/seo/SEOHead'

interface Software {
  _id: string
  slug?: string
  name: string
  description: string
  downloadUrl: string
  importantNote: string
  language?: string
  headUnitTypeId?: { _id?: string; name?: string } | string | null
  createdAt?: string
  updatedAt?: string
}

const SoftwareDownloadDetail: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const [software, setSoftware] = useState<Software | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadSoftware = async () => {
      if (!slug) {
        setError(true)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(false)
      try {
        const response = await fetch(`/api/software/${encodeURIComponent(slug)}`)
        const data = await response.json()
        if (!cancelled && data.success && data.software) {
          setSoftware(data.software)
        } else if (!cancelled) {
          setSoftware(null)
          setError(true)
        }
      } catch {
        if (!cancelled) {
          setSoftware(null)
          setError(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSoftware()
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div className="page-container px-4 py-16 text-center text-sm text-slate-500 dark:text-gray-400">
        {t('common.loading')}
      </div>
    )
  }

  if (error || !software) {
    return (
      <div className="page-container px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-white">{t('softwareDownloads.noSoftware')}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{t('softwareDownloads.noSoftwareDesc')}</p>
        <Button className="mt-6" onClick={() => navigate('/software-downloads')}>
          {t('softwareDownloads.title')}
        </Button>
      </div>
    )
  }

  const headUnitName = typeof software.headUnitTypeId === 'object' ? software.headUnitTypeId?.name : undefined

  return (
    <div className="page-container">
      <SEOHead
        title={`${software.name} - ${t('softwareDownloads.title')}`}
        description={software.description || t('softwareDownloads.title')}
        keywords={['software download', software.name, ...(headUnitName ? [headUnitName] : [])]}
        type="article"
      />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/software-downloads')}
          className="mb-4 text-sm font-medium text-slate-600 transition hover:text-cyan-600 dark:text-gray-300 dark:hover:text-cyan-400"
        >
          {t('softwareDownloads.title')}
        </button>

        <article className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
          <header className="px-5 py-4">
            <h1 className="text-xl font-semibold text-slate-800 dark:text-white">{software.name}</h1>
            {headUnitName ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{headUnitName}</p>
            ) : null}
          </header>
          <div className="space-y-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
            {software.description ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-gray-300">
                {software.description}
              </p>
            ) : null}
            {software.importantNote ? (
              <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">
                {software.importantNote}
              </p>
            ) : null}
            <div className="pt-2">
              <Button onClick={() => window.open(software.downloadUrl, '_blank')}>
                {t('softwareDownloads.download')}
              </Button>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}

export default SoftwareDownloadDetail
