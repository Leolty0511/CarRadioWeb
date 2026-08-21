import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
import CANBusSettingsPanel from '@/components/CANBusSettingsPanel'
import SEOHead from '@/components/seo/SEOHead'
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema'
import { useKnowledgeSection } from '@/hooks/useKnowledgeSection'
import canbusSettingsService from '@/services/canbusSettingsService'

const CANBusSettings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const sectionEnabled = useKnowledgeSection('canbusSettingsEnabled')
  const [intro, setIntro] = useState('')

  useEffect(() => {
    let cancelled = false
    const loadIntro = async () => {
      try {
        const data = await canbusSettingsService.getPageIntro()
        const custom = (data.en || data.zh).trim()
        if (!cancelled) {
          setIntro(custom || t('knowledge.sections.canbusSettingsDesc'))
        }
      } catch {
        if (!cancelled) {
          setIntro(t('knowledge.sections.canbusSettingsDesc'))
        }
      }
    }
    loadIntro()
    return () => {
      cancelled = true
    }
  }, [i18n.language, t])

  if (sectionEnabled !== true) {return null}

  return (
    <div className="page-container">
      <SEOHead
        title={`${t('knowledge.sections.canbusSettings')} - ${t('knowledge.seo.title')}`}
        description={intro || t('knowledge.sections.canbusSettingsDesc')}
        keywords={['CANBus', 'CAN settings', 'car model settings']}
        type="website"
      />
      <BreadcrumbSchema items={[
        { name: 'Home', path: '/' },
        { name: t('knowledge.title'), path: '/knowledge' },
        { name: t('knowledge.sections.canbusSettings'), path: '/knowledge/canbus-settings' },
      ]} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              {t('knowledge.sections.canbusSettings')}
            </h1>
          </div>
          {intro ? (
            <p className="text-slate-600 dark:text-gray-400 max-w-3xl whitespace-pre-wrap">
              {intro}
            </p>
          ) : null}
        </div>

        <CANBusSettingsPanel />
      </div>
    </div>
  )
}

export default CANBusSettings
