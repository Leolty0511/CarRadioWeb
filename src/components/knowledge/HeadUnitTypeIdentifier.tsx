import React, { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import ReferenceImageModal from '@/components/ReferenceImageModal'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'
import type { HeadUnitType } from '@/services/canbusSettingsService'
import { getKnowledgeImageThumbnailUrl } from '@/utils/knowledgeImage'

interface HeadUnitTypeIdentifierProps {
  className?: string
  onSelected?: (type: HeadUnitType) => void
  buttonLabel?: string
  compact?: boolean
}

const getHeadUnitImages = (type: HeadUnitType) => Array.from(new Set([
  ...(type.images || []),
  type.image,
].filter(Boolean))).slice(0, 2)

const HeadUnitTypeIdentifier: React.FC<HeadUnitTypeIdentifierProps> = ({
  className = '',
  onSelected,
  buttonLabel,
  compact = false,
}) => {
  const { t } = useTranslation()
  const {
    headUnitTypes,
    loading,
    selectedHeadUnitType,
    selectHeadUnitType,
  } = useHeadUnitTypes()
  const [isOpen, setIsOpen] = useState(false)
  const [previewHeadUnitType, setPreviewHeadUnitType] = useState<HeadUnitType | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)

  const openLabel = buttonLabel || (
    selectedHeadUnitType
      ? t('knowledge.changeHeadUnitType')
      : t('knowledge.identifyHeadUnitType')
  )

  const scrollTypes = (direction: 'left' | 'right') => {
    carouselRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth',
    })
  }

  const handleSelect = (type: HeadUnitType) => {
    selectHeadUnitType(type._id)
    onSelected?.(type)
    setIsOpen(false)
  }

  const previewImages = useMemo(
    () => previewHeadUnitType
      ? getHeadUnitImages(previewHeadUnitType).map((url, index) => ({
        url,
        label: `${t('knowledge.headUnitImageLabel')} ${index + 1}`,
      }))
      : [],
    [previewHeadUnitType, t]
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-50 dark:border-cyan-400 dark:text-cyan-300 dark:hover:bg-cyan-950/40 ${compact ? 'px-3 py-1.5' : ''} ${className}`}
      >
        {openLabel}
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('knowledge.headUnitTypeSelectorTitle')}
        size="xl"
        className="max-w-5xl"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-600 dark:text-gray-300">
            {t('knowledge.sharedHeadUnitTypeSelectorDescription')}
          </p>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-gray-400">
              {t('common.loading')}
            </p>
          ) : headUnitTypes.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-gray-400">
              {t('knowledge.noHeadUnitTypes')}
            </p>
          ) : (
            <div className="relative">
              <button
                type="button"
                aria-label={t('common.previous')}
                title={t('common.previous')}
                onClick={() => scrollTypes('left')}
                className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div
                ref={carouselRef}
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-11 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {headUnitTypes.map(type => {
                  const images = getHeadUnitImages(type)
                  const isCurrent = selectedHeadUnitType?._id === type._id
                  return (
                    <article
                      key={type._id}
                      className={`w-[min(82vw,320px)] flex-none snap-start overflow-hidden rounded-xl border bg-slate-50 text-left dark:bg-gray-800 ${
                        isCurrent
                          ? 'border-cyan-600 ring-2 ring-cyan-500/20 dark:border-cyan-400'
                          : 'border-slate-200 dark:border-gray-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewHeadUnitType(type)}
                        className="block w-full text-left"
                        aria-label={`${t('knowledge.viewHeadUnitDetails')}: ${type.name}`}
                      >
                        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 dark:bg-gray-900">
                          {images.length > 0 ? images.map((image, index) => (
                            <img
                              key={`${type._id}-${image}`}
                              src={getKnowledgeImageThumbnailUrl(image)}
                              alt={`${type.name} ${index + 1}`}
                              className="h-44 w-full object-contain bg-white p-2 dark:bg-gray-800"
                              loading="lazy"
                              decoding="async"
                            />
                          )) : (
                            <div className="col-span-2 flex h-44 items-center justify-center bg-slate-100 text-sm text-slate-400 dark:bg-gray-700 dark:text-gray-500">
                              {t('knowledge.noHeadUnitImage')}
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <h3 className="font-medium text-slate-800 dark:text-white">{type.name}</h3>
                          <p className="mt-2 text-sm font-medium text-cyan-700 dark:text-cyan-300">
                            {t('knowledge.viewHeadUnitDetails')}
                          </p>
                        </div>
                      </button>
                      <div className="border-t border-slate-200 p-3 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => handleSelect(type)}
                          className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-400"
                        >
                          {isCurrent ? t('knowledge.currentHeadUnitType') : t('knowledge.useThisHeadUnitType')}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
              <button
                type="button"
                aria-label={t('common.next')}
                title={t('common.next')}
                onClick={() => scrollTypes('right')}
                className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </Modal>

      {previewHeadUnitType && (
        <ReferenceImageModal
          isOpen={Boolean(previewHeadUnitType)}
          onClose={() => setPreviewHeadUnitType(null)}
          images={previewImages}
          title={previewHeadUnitType.name}
          description={previewHeadUnitType.description}
          altText={previewHeadUnitType.name}
        />
      )}
    </>
  )
}

export default HeadUnitTypeIdentifier
