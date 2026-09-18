import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  LoaderCircle,
  PlayCircle,
} from 'lucide-react'
import { getPublicQrLinkHub, type PublicQrLinkHub, type QrLinkType } from '@/services/qrLinkHubService'

const LINK_ICONS: Record<QrLinkType, typeof Link2> = {
  video: PlayCircle,
  pdf: FileText,
  website: Globe2,
  page: ExternalLink,
  download: Download,
  other: Link2,
}

export default function QrLinkLanding() {
  const { token = '' } = useParams()
  const [hub, setHub] = useState<PublicQrLinkHub | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const previousTitle = document.title
    const previousRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const previousContent = previousRobots?.content
    const robots = previousRobots || document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    if (!previousRobots) {document.head.appendChild(robots)}
    return () => {
      document.title = previousTitle
      if (previousRobots) {previousRobots.content = previousContent || ''}
      else {robots.remove()}
    }
  }, [])

  useEffect(() => {
    document.title = `${hub?.title || 'Resource links'} | Car Radio`
  }, [hub?.title])

  useEffect(() => {
    let active = true
    setHub(null)
    setError('')
    getPublicQrLinkHub(token).then((result) => {
      if (!active) {return}
      if (result.data) {setHub(result.data)}
      else {setError(result.error || 'qr_page_not_found')}
    })
    return () => { active = false }
  }, [token])

  const unavailableText = useMemo(
    () => error === 'qr_page_disabled'
      ? 'This resource is temporarily unavailable'
      : error === 'qr_page_unavailable'
        ? 'Unable to load this resource'
        : 'This resource is unavailable or has been removed',
    [error],
  )

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        {!hub && !error && (
          <div className="flex min-h-[60vh] items-center justify-center" role="status">
            <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" />
            <span className="sr-only">Loading</span>
          </div>
        )}

        {error && (
          <section className="mt-[18vh] border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Link2 className="mx-auto h-9 w-9 text-slate-400" />
            <h1 className="mt-4 text-xl font-semibold">{unavailableText}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {error === 'qr_page_unavailable' ? 'Please check your connection and try again.' : 'Please contact your provider for an updated QR code.'}
            </p>
          </section>
        )}

        {hub && (
          <>
            <header className="mb-7 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center bg-slate-900 text-white dark:bg-white dark:text-slate-950">
                <Link2 className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold leading-tight sm:text-3xl">{hub.title}</h1>
              {hub.description && <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">{hub.description}</p>}
            </header>

            <section className="space-y-3" aria-label="Available resources">
              {hub.links.map((link) => {
                const Icon = LINK_ICONS[link.type] || Link2
                return (
                  <a
                    key={link.id}
                    href={link.url}
                    className="group flex min-h-16 items-center gap-4 border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-slate-900/70"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium">{link.label}</span>
                      {link.description && <span className="mt-0.5 block text-sm leading-5 text-slate-500 dark:text-slate-400">{link.description}</span>}
                    </span>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </a>
                )
              })}
              {hub.links.length === 0 && (
                <div className="border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  No resources are available right now.
                </div>
              )}
            </section>

            <footer className="mt-8 text-center text-xs text-slate-400">Car Radio Resource Hub</footer>
          </>
        )}
      </div>
    </main>
  )
}
