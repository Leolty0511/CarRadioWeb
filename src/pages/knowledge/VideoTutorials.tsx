import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Video } from 'lucide-react'
import CategoryBrowser from '@/components/CategoryBrowser'
import SEOHead from '@/components/seo/SEOHead'
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema'
import { useKnowledgeSection } from '@/hooks/useKnowledgeSection'

interface VideoTutorialsProps {
  tutorialType?: 'installation' | 'device-operation'
  titleKey?: 'videoTutorials' | 'deviceOperationVideos'
  routePath?: string
}

const VideoTutorials: React.FC<VideoTutorialsProps> = ({
  tutorialType = 'installation',
  titleKey = 'videoTutorials',
  routePath = '/knowledge/video-tutorials',
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const sectionEnabled = useKnowledgeSection(
    tutorialType === 'device-operation' ? 'deviceOperationVideosEnabled' : 'videoTutorialsEnabled'
  )
  const langPrefix = i18n.language === 'en' ? '' : `/${i18n.language}`

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

        <CategoryBrowser
          documentType="video"
          tutorialType={tutorialType}
          onViewDocument={handleViewDocument}
          className="space-y-6"
        />
      </div>
    </div>
  )
}

export default VideoTutorials
