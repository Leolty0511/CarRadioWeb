import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Video } from 'lucide-react'
import CategoryBrowser from '@/components/CategoryBrowser'
import ReferenceImageModal from '@/components/ReferenceImageModal'
import SEOHead from '@/components/seo/SEOHead'
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema'
import KnowledgeHomeLink from '@/components/knowledge/KnowledgeHomeLink'
import { useKnowledgeSection } from '@/hooks/useKnowledgeSection'
import canbusSettingsService, { type HeadUnitType } from '@/services/canbusSettingsService'
import { getKnowledgeImageThumbnailUrl } from '@/utils/knowledgeImage'

interface VideoTutorialsProps {
  tutorialType?: 'installation' | 'device-operation'
  titleKey?: 'videoTutorials' | 'deviceOperationVideos'
  routePath?: string
}

const getHeadUnitImages = (type: HeadUnitType) => Array.from(new Set([
  ...(type.images || []),
  type.image,
].filter(Boolean))).slice(0, 2)

const VideoTutorials: React.FC<VideoTutorialsProps> = ({
  tutorialType = 'installation',
  titleKey = 'videoTutorials',
  routePath = '/knowledge/video-tutorials',
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const headUnitTypeId = searchParams.get('headUnitTypeId') || undefined
  const [headUnitTypes, setHeadUnitTypes] = React.useState<HeadUnitType[]>([])
  const [headUnitTypesLoading, setHeadUnitTypesLoading] = React.useState(false)
  const [previewHeadUnitType, setPreviewHeadUnitType] = React.useState<HeadUnitType | null>(null)
  const headUnitCarouselRef = React.useRef<HTMLDivElement>(null)
  const sectionEnabled = useKnowledgeSection(
    tutorialType === 'device-operation' ? 'deviceOperationVideosEnabled' : 'videoTutorialsEnabled'
  )
  const langPrefix = i18n.language === 'en' ? '' : `/${i18n.language}`
  const selectedHeadUnitType = headUnitTypes.find(type => type._id === headUnitTypeId)
  const previewImages = previewHeadUnitType
    ? getHeadUnitImages(previewHeadUnitType).map((url, index) => ({
      url,
      label: `${t('knowledge.headUnitImageLabel')} ${index + 1}`,
    }))
    : []

  React.useEffect(() => {
    if (tutorialType !== 'device-operation') {
      return
    }
    let cancelled = false
    setHeadUnitTypesLoading(true)
    canbusSettingsService.getHeadUnitTypes()
      .then(types => {
        if (!cancelled) {
          setHeadUnitTypes(types)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeadUnitTypes([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHeadUnitTypesLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [tutorialType])

  const handleHeadUnitTypeSelect = (id: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('headUnitTypeId', id)
    setSearchParams(nextParams)
  }

  const handleClearHeadUnitType = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('headUnitTypeId')
    setSearchParams(nextParams)
  }

  const scrollHeadUnitTypes = (direction: 'left' | 'right') => {
    headUnitCarouselRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth'
    })
  }

  const handleViewDocument = (document: any) => {
    const docId = document._id || document.id
    const docSlug = document.slug
    const identifier = docSlug || docId
    navigate(`${langPrefix}/knowledge/video/${identifier}`)
  }

  if (sectionEnabled !== true) {return null}

  return (
    <div className="page-container">
      <SEOHead
        title={`${t(`knowledge.sections.${titleKey}`)} - ${t('knowledge.seo.title')}`}
        description={t(`knowledge.sections.${titleKey}Desc`)}
        keywords={['video tutorials', 'head unit', 'installation guide']}
        type="website"
      />
      <BreadcrumbSchema items={[
        { name: 'Home', path: '/' },
        { name: t('knowledge.title'), path: '/knowledge' },
        { name: t(`knowledge.sections.${titleKey}`), path: routePath },
      ]} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <KnowledgeHomeLink className="mb-5" />
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-teal-500 rounded-lg flex items-center justify-center">
              <Video className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              {t(`knowledge.sections.${titleKey}`)}
            </h1>
          </div>
          <p className="text-slate-600 dark:text-gray-400 max-w-3xl">
            {t(`knowledge.sections.${titleKey}Desc`)}
          </p>
        </div>

        {tutorialType === 'device-operation' && (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                  {t('knowledge.headUnitTypeSelectorTitle')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                  {t('knowledge.headUnitTypeSelectorDescription')}
                </p>
              </div>
              {selectedHeadUnitType && (
                <button
                  type="button"
                  onClick={handleClearHeadUnitType}
                  className="text-sm text-cyan-700 hover:underline dark:text-cyan-300"
                >
                  {t('knowledge.changeHeadUnitType')}
                </button>
              )}
            </div>

            {headUnitTypesLoading ? (
              <p className="py-6 text-sm text-slate-500 dark:text-gray-400">{t('common.loading')}</p>
            ) : headUnitTypes.length === 0 ? (
              <p className="py-6 text-sm text-slate-500 dark:text-gray-400">{t('knowledge.noHeadUnitTypes')}</p>
            ) : (
              <>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={t('common.previous')}
                    title={t('common.previous')}
                    onClick={() => scrollHeadUnitTypes('left')}
                    className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div
                    ref={headUnitCarouselRef}
                    className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-11 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {headUnitTypes.map(type => {
                      const images = getHeadUnitImages(type)
                      return (
                        <button
                          key={type._id}
                          type="button"
                          onClick={() => setPreviewHeadUnitType(type)}
                          className="w-[min(78vw,280px)] flex-none snap-start overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-cyan-600"
                        >
                          <div className={`grid gap-1 bg-slate-100 p-1 dark:bg-gray-900 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {images.length > 0 ? images.map((image, index) => (
                              <img
                                key={`${type._id}-${image}`}
                                src={getKnowledgeImageThumbnailUrl(image)}
                                alt={`${type.name} ${index + 1}`}
                                className="h-36 w-full object-contain bg-white p-1 dark:bg-gray-800"
                                loading="lazy"
                                decoding="async"
                              />
                            )) : (
                              <div className="flex h-36 items-center justify-center bg-slate-100 text-sm text-slate-400 dark:bg-gray-700 dark:text-gray-500">
                                {t('knowledge.noHeadUnitImage')}
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="font-medium text-slate-800 dark:text-white">{type.name}</h3>
                            <p className="mt-1 text-xs text-slate-400 dark:text-gray-500">
                              {t('knowledge.viewHeadUnitDetails')}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    aria-label={t('common.next')}
                    title={t('common.next')}
                    onClick={() => scrollHeadUnitTypes('right')}
                    className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-gray-700">
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-gray-300">
                    {t('knowledge.headUnitTypeFilterLabel')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {headUnitTypes.map(type => {
                      const isSelected = type._id === headUnitTypeId
                      return (
                        <button
                          key={type._id}
                          type="button"
                          onClick={() => handleHeadUnitTypeSelect(type._id)}
                          className={`rounded-full border px-3 py-1.5 text-sm transition ${
                            isSelected
                              ? 'border-cyan-600 bg-cyan-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-cyan-600'
                          }`}
                        >
                          {type.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {tutorialType !== 'device-operation' || selectedHeadUnitType ? (
          <CategoryBrowser
            documentType="video"
            tutorialType={tutorialType}
            headUnitTypeId={headUnitTypeId}
            onViewDocument={handleViewDocument}
            className="space-y-6"
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
            {t('knowledge.selectHeadUnitTypeToViewVideos')}
          </div>
        )}
      </div>

      {previewHeadUnitType && previewImages.length > 0 && (
        <ReferenceImageModal
          isOpen={Boolean(previewHeadUnitType)}
          onClose={() => setPreviewHeadUnitType(null)}
          images={previewImages}
          title={previewHeadUnitType.name}
          description={previewHeadUnitType.description}
          altText={previewHeadUnitType.name}
        />
      )}
    </div>
  )
}

export default VideoTutorials
