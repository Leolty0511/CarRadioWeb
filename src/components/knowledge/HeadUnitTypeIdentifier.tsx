import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'
import type { HeadUnitType } from '@/services/canbusSettingsService'

interface HeadUnitTypeIdentifierProps {
  className?: string
  onSelected?: (type: HeadUnitType) => void
  buttonLabel?: string
  compact?: boolean
}

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

  const openLabel = buttonLabel || (
    selectedHeadUnitType
      ? t('knowledge.changeHeadUnitType')
      : t('knowledge.identifyHeadUnitType')
  )

  const handleSelect = (type: HeadUnitType) => {
    selectHeadUnitType(type._id)
    onSelected?.(type)
    setIsOpen(false)
  }

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {headUnitTypes.map(type => (
                <button
                  key={type._id}
                  type="button"
                  onClick={() => handleSelect(type)}
                  className={`overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:border-cyan-500 hover:shadow-md dark:hover:border-cyan-400 ${
                    selectedHeadUnitType?._id === type._id
                      ? 'border-cyan-600 ring-2 ring-cyan-500/20 dark:border-cyan-400'
                      : 'border-slate-200 dark:border-gray-700'
                  } bg-slate-50 dark:bg-gray-800`}
                >
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 dark:bg-gray-900">
                    {[...(type.images || []), type.image].filter(Boolean).slice(0, 2).map((image, index) => (
                      <img
                        key={`${type._id}-${image}`}
                        src={image}
                        alt={`${type.name} ${index + 1}`}
                        className="h-32 w-full object-contain bg-white p-2 dark:bg-gray-800"
                      />
                    ))}
                    {(!type.images?.length && !type.image) && (
                      <div className="col-span-2 flex h-32 items-center justify-center bg-slate-100 text-sm text-slate-400 dark:bg-gray-700 dark:text-gray-500">
                        {t('knowledge.noHeadUnitImage')}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-slate-800 dark:text-white">{type.name}</h3>
                    {type.description?.trim() && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-gray-400">
                        {type.description}
                      </p>
                    )}
                    <span className="mt-3 block text-sm font-medium text-cyan-700 dark:text-cyan-300">
                      {t('knowledge.useThisHeadUnitType')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

export default HeadUnitTypeIdentifier
