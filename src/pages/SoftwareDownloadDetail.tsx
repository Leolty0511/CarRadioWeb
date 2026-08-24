import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
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
        if (!cancelled) {setLoading(false)}
      }
    }

    void loadSoftware()
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div className="page-container flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
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
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/software-downloads')}
          className="mb-6 text-sm font-medium text-slate-600 transition hover:text-cyan-600 dark:text-gray-300 dark:hover:text-cyan-400"
        >
          {t('softwareDownloads.title')}
        </button>

        <article className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <header className="border-b border-slate-200 p-6 dark:border-gray-700 sm:p-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{software.name}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
              {headUnitName || t('softwareDownloads.title')}
            </p>
          </header>
          <div className="space-y-6 p-6 sm:p-8">
            <p className="whitespace-pre-wrap text-base leading-7 text-slate-600 dark:text-gray-300">
              {software.description}
            </p>
            {software.importantNote && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600 dark:text-amber-400" />
                  <p className="text-sm leading-6 text-amber-700 dark:text-amber-200">{software.importantNote}</p>
                </div>
              </div>
            )}
          </div>
          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-6 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row">
            <Button className="flex-1" onClick={() => window.open(software.downloadUrl, '_blank')}>
              {t('softwareDownloads.download')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => window.open(software.downloadUrl, '_blank')}>
              {t('userManual.openInNewTab')}
            </Button>
          </footer>
        </article>
      </div>
    </div>
  )
}

export default SoftwareDownloadDetail
