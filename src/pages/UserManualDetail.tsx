import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import SEOHead from '@/components/seo/SEOHead'
import { useContentHref } from '@/hooks/useContentHref'

interface Manual {
  id: string
  title: string
  productModel: string
  description?: string
  version?: string
  url: string
  downloadUrl: string
  sizeFormatted: string
  headUnitType?: { _id?: string; name?: string } | null
}

const UserManualDetail: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { contentHref } = useContentHref()
  const { slug } = useParams<{ slug: string }>()
  const [manual, setManual] = useState<Manual | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoading, setIframeLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadManual = async () => {
      if (!slug) {
        setError(true)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(false)
      try {
        const response = await fetch(`/api/user-manual/${encodeURIComponent(slug)}`)
        const data = await response.json()
        if (!cancelled && data.success && data.manual) {
          setManual(data.manual)
          setIframeLoading(true)
        } else if (!cancelled) {
          setManual(null)
          setError(true)
        }
      } catch {
        if (!cancelled) {
          setManual(null)
          setError(true)
        }
      } finally {
        if (!cancelled) {setLoading(false)}
      }
    }

    void loadManual()
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div className="page-container flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !manual) {
    return (
      <div className="page-container px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-white">{t('userManual.noManuals')}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{t('userManual.noManualsDesc')}</p>
        <Button className="mt-6" onClick={() => navigate(contentHref('/user-manual'))}>
          {t('userManual.backToManuals')}
        </Button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <SEOHead
        title={`${manual.title} - ${t('userManual.title')}`}
        description={manual.description || t('userManual.description')}
        keywords={['user manual', manual.productModel, manual.title]}
        type="article"
      />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate(contentHref('/user-manual'))}
          className="mb-6 text-sm font-medium text-slate-600 transition hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
        >
          {t('userManual.backToManuals')}
        </button>

        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 dark:border-gray-700 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              <FileText className="h-4 w-4" />
              {t('userManual.badge')}
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{manual.title}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
              {t('userManual.model')}: {manual.productModel}
              {manual.version ? ` · ${t('userManual.version')} ${manual.version}` : ''}
              {manual.headUnitType?.name ? ` · ${manual.headUnitType.name}` : ''}
            </p>
            {manual.description && (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-gray-300">{manual.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { window.location.href = manual.downloadUrl }}>
              {t('userManual.download')}
            </Button>
            <Button variant="outline" onClick={() => window.open(manual.url, '_blank')}>
              {t('userManual.openInNewTab')}
            </Button>
          </div>
        </header>

        <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
          {iframeLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          )}
          <iframe
            src={`${manual.url}#toolbar=0&navpanes=0&scrollbar=1`}
            className="h-full w-full border-0"
            title={manual.title}
            onLoad={() => setIframeLoading(false)}
          />
        </div>
      </div>
    </div>
  )
}

export default UserManualDetail
