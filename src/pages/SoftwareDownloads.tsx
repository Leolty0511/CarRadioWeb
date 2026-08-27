import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SEOHead from '@/components/seo/SEOHead'
import HeadUnitTypeIdentifier from '@/components/knowledge/HeadUnitTypeIdentifier'
import FilterChipBar from '@/components/knowledge/FilterChipBar'
import KnowledgeDocumentList from '@/components/knowledge/KnowledgeDocumentList'
import { useHeadUnitTypes } from '@/contexts/HeadUnitTypeContext'
import { ALL_CATEGORY_ID } from '@/utils/knowledgeCategoryChips'

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
  const {
    headUnitTypes,
    selectedHeadUnitType,
    selectedHeadUnitTypeId,
    selectHeadUnitType,
    clearHeadUnitType
  } = useHeadUnitTypes()
  const [software, setSoftware] = useState<Software[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSoftware = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (selectedHeadUnitTypeId) {
          params.set('headUnitTypeId', selectedHeadUnitTypeId)
        }
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

  const handleDownload = (event: React.MouseEvent, item: Software) => {
    event.stopPropagation()
    window.open(item.downloadUrl, '_blank')
  }

  const typeChips = [
    { id: ALL_CATEGORY_ID, label: t('common.all') },
    ...headUnitTypes.map(type => ({ id: type._id, label: type.name }))
  ]

  return (
    <div className="page-container">
      <SEOHead pageKey="software-downloads" />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            {t('softwareDownloads.title')}
          </h1>
        </header>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-gray-400">
            {selectedHeadUnitType
              ? `${t('knowledge.currentHeadUnitType')}: ${selectedHeadUnitType.name}`
              : t('knowledge.resourceSoftwareHeadUnitTypeHint')}
          </p>
          <HeadUnitTypeIdentifier compact className="shrink-0 self-start sm:self-auto" />
        </div>

        {typeChips.length > 1 ? (
          <FilterChipBar
            className="mb-5"
            label={t('softwareDownloads.headUnitTypeFilterLabel')}
            ariaLabel={t('softwareDownloads.headUnitTypeFilterLabel')}
            items={typeChips}
            selectedId={selectedHeadUnitTypeId || ALL_CATEGORY_ID}
            onSelect={(id) => {
              if (id === ALL_CATEGORY_ID) {
                clearHeadUnitType()
                return
              }
              selectHeadUnitType(id)
            }}
          />
        ) : null}

        <KnowledgeDocumentList
          accent="structured"
          loading={loading}
          loadingText={t('common.loading')}
          emptyText={t('softwareDownloads.noSoftwareDesc')}
          items={software.map(item => ({
            id: item._id,
            title: item.name,
            description: item.description || item.importantNote,
            onClick: () => navigate(`/software-downloads/${encodeURIComponent(item.slug || item._id)}`),
            actions: (
              <button
                type="button"
                onClick={(event) => handleDownload(event, item)}
                className="rounded-full border border-cyan-600 px-3 py-1.5 text-sm text-cyan-700 transition hover:bg-cyan-50 dark:border-cyan-400 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
              >
                {t('softwareDownloads.download')}
              </button>
            )
          }))}
        />
      </div>
    </div>
  )
}

export default SoftwareDownloads
