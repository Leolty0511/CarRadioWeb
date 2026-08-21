import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/Card'
import ImageGallery, { type GalleryImage } from '@/components/ImageGallery'
import DocumentFeedback from '@/components/DocumentFeedback'
import { sanitizeHTMLForReact } from '@/utils/sanitize'

interface StructuredDocumentViewerProps {
  document: any
  onBack: () => void
}

const StructuredDocumentViewer: React.FC<StructuredDocumentViewerProps> = ({ document, onBack }) => {
  const { t, i18n } = useTranslation()
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [initialImageIndex, setInitialImageIndex] = useState(0)

  const tutorialSections = Array.isArray(document.tutorialSections) ? document.tutorialSections : []
  const faqs = Array.isArray(document.faqs) ? document.faqs : []
  const vehicleImage = document.basicInfo?.vehicleImage || document.vehicleImage || ''
  const introduction = document.basicInfo?.introduction || document.introduction || ''
  const importantNotes = document.basicInfo?.importantNotes || document.importantNotes || ''
  const brand = document.basicInfo?.brand || document.brand || ''
  const model = document.basicInfo?.model || document.model || ''
  const yearRange = document.basicInfo?.yearRange || document.yearRange || ''

  const galleryImages = useMemo<GalleryImage[]>(() => {
    const result: GalleryImage[] = []
    if (vehicleImage) {result.push({ url: vehicleImage, alt: `${brand} ${model}`.trim(), title: document.title })}
    tutorialSections.forEach((section: any) => {
      if (section.imageUrl) {result.push({ url: section.imageUrl, alt: section.imageAlt || section.heading, title: section.heading })}
    })
    faqs.forEach((faq: any) => {
      ;(faq.images || []).forEach((url: string) => {
        if (url) {result.push({ url, alt: faq.title, title: faq.title })}
      })
    })
    return result
  }, [brand, document.title, faqs, model, tutorialSections, vehicleImage])

  const openGallery = (url: string) => {
    const index = galleryImages.findIndex(image => image.url === url)
    setInitialImageIndex(index >= 0 ? index : 0)
    setGalleryOpen(true)
  }

  const displayDate = document.publishedAt || document.createdAt
  const dateText = displayDate
    ? new Date(displayDate).toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US')
    : t('common.unknown')

  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('knowledge.wiringGuide')}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{document.title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{[brand, model, yearRange].filter(Boolean).join(' / ')}</p>
      </div>
      <button type="button" onClick={onBack} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">{t('knowledge.backToSelect')}</button>
    </div>

    <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span>{t('knowledge.author')}: {document.author || t('knowledge.technicalTeam')}</span>
      <span>{t('knowledge.uploadTime')}: {dateText}</span>
      <span>{t('knowledge.viewCount')}: {document.views || 0}</span>
    </div>

    <section aria-labelledby="basic-information-title">
      <h2 id="basic-information-title" className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">{t('knowledge.vehicleResearch.basicInfo')}</h2>
      <Card><CardContent className="space-y-6 p-6 md:p-8">
        {vehicleImage && <button type="button" className="block w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" onClick={() => openGallery(vehicleImage)}><img src={vehicleImage} alt={`${brand} ${model}`.trim()} className="mx-auto max-h-[560px] w-full object-contain" loading="lazy" /></button>}
        {introduction && <div className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={sanitizeHTMLForReact(introduction)} />}
        {importantNotes && <div className="rounded-md border border-red-200 bg-red-50 p-5 text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200"><h3 className="mb-3 text-base font-semibold">{t('common.importantNotes')}</h3><div className="prose max-w-none text-current dark:prose-invert" dangerouslySetInnerHTML={sanitizeHTMLForReact(importantNotes)} /></div>}
      </CardContent></Card>
    </section>

    <section aria-labelledby="wiring-tutorial-title">
      <h2 id="wiring-tutorial-title" className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">{t('knowledge.wiringTutorial')}</h2>
      {tutorialSections.length > 0 ? <div className="space-y-6">
        {tutorialSections.map((section: any, index: number) => <Card key={section.id || index}><CardContent className="p-6 md:p-8">
          <div className={`flex flex-col gap-6 ${section.layout === 'imageRight' ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
            {section.imageUrl && <button type="button" onClick={() => openGallery(section.imageUrl)} className="w-full flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 md:w-1/2 dark:border-slate-700 dark:bg-slate-800"><img src={section.imageUrl} alt={section.imageAlt || section.heading} className="h-auto max-h-[440px] w-full object-contain" loading="lazy" />{section.imageAlt && <span className="block border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{section.imageAlt}</span>}</button>}
            <div className={section.imageUrl ? 'w-full md:w-1/2' : 'w-full'}><p className="mb-2 text-sm font-medium text-blue-600 dark:text-blue-400">{t('knowledge.wiringStep', { index: index + 1 })}</p><h3 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">{section.heading}</h3><div className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={sanitizeHTMLForReact(section.content || '')} /></div>
          </div>
        </CardContent></Card>)}
      </div> : <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{t('knowledge.noWiringTutorial')}</div>}
    </section>

    <section aria-labelledby="faq-title">
      <h2 id="faq-title" className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">{t('knowledge.cardSections.faqs')}</h2>
      {faqs.length > 0 ? <div className="space-y-3">{faqs.map((faq: any, index: number) => <details key={faq.id || index} className="group rounded-md border border-slate-200 bg-white open:shadow-sm dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer list-none px-5 py-4 font-medium text-slate-900 dark:text-white">{faq.title}</summary><div className="border-t border-slate-200 px-5 py-5 dark:border-slate-700"><div className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={sanitizeHTMLForReact(faq.description || '')} />{faq.images?.[0] && <button type="button" onClick={() => openGallery(faq.images[0])} className="mt-4 block max-w-xl overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"><img src={faq.images[0]} alt={faq.title} className="h-auto w-full" loading="lazy" /></button>}</div></details>)}</div> : <p className="text-sm text-slate-500 dark:text-slate-400">{t('knowledge.noFaqs')}</p>}
    </section>

    <DocumentFeedback documentId={document._id || document.id} documentType="structured" className="mt-6" />
    <ImageGallery isOpen={galleryOpen} onClose={() => setGalleryOpen(false)} images={galleryImages} initialIndex={initialImageIndex} />
  </div>
}

export default StructuredDocumentViewer
