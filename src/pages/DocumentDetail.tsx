import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, AlertTriangle, Heart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import StructuredDocumentViewer from '@/components/StructuredDocumentViewer'
import GeneralDocumentViewer from '@/components/GeneralDocumentViewer'
import VideoPlayer from '@/components/VideoPlayer'
import SEOHead from '@/components/seo/SEOHead'
import BreadcrumbSchema from '@/components/seo/BreadcrumbSchema'
import ArticleSchema from '@/components/seo/ArticleSchema'
import { getDocument, recordDocumentView } from '@/services/documentApi'
import { getPersistentFingerprint, getSessionId } from '@/utils/fingerprint'
import { useAuth } from '@/contexts/AuthContext'
import { addMemberFavorite, getFavoriteStatus, removeMemberFavorite } from '@/services/memberAuthService'

/**
 * 文档详情页面
 * 用于显示单个文档的完整内容
 * 支持三种文档类型：结构化文档(车型资料)、视频教程、通用文档
 */
const DocumentDetail: React.FC = () => {
  const { type, id } = useParams<{ type: string; id: string }>() // id可以是MongoDB ID或slug
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const [document, setDocument] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [favorited, setFavorited] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)

  useEffect(() => {
    const loadDocument = async () => {
      if (!id || !type) {
        setError('Invalid document ID or type')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // 根据URL类型映射到文档类型
        let documentType: 'structured' | 'video' | 'general'
        if (type === 'vehicle') {
          documentType = 'structured'
        } else if (type === 'video') {
          documentType = 'video'
        } else if (type === 'article') {
          documentType = 'general'
        } else {
          setError('Invalid document type')
          setLoading(false)
          return
        }

        // 加载文档（支持ID或slug）
        const doc = await getDocument(id, documentType)

        if (!doc) {
          setError('Document not found')
          setLoading(false)
          return
        }

        // 确保文档有正确的类型信息
        (doc as any).documentType = doc.documentType || documentType
        setDocument(doc)
        if (user?.type === 'member' && doc._id) {
          const favoriteStatus = await getFavoriteStatus(String(doc._id))
          setFavorited(favoriteStatus.success && favoriteStatus.data?.favorited === true)
        }

        // 记录浏览（异步，不阻塞显示）
        try {
          const fingerprint = getPersistentFingerprint()
          const sessionId = getSessionId()
          recordDocumentView(id, documentType, fingerprint, sessionId)
            .catch(() => {
              // 静默处理浏览记录失败，不影响用户体验
            })
        } catch (error) {
          console.error('生成指纹失败:', error)
        }
      } catch (err) {
        console.error('Failed to load document:', err)
        setError('Failed to load document')
      } finally {
        setLoading(false)
      }
    }

    loadDocument()
  }, [id, type, user?.type])

  const toggleFavorite = async () => {
    if (!document?._id || user?.type !== 'member' || favoriteBusy) return
    setFavoriteBusy(true)
    const result = favorited ? await removeMemberFavorite(String(document._id)) : await addMemberFavorite(String(document._id))
    if (result.success) setFavorited(!favorited)
    setFavoriteBusy(false)
  }

  const handleBack = () => {
    if (document?.documentType === 'video' || document?.type === 'video') {
      navigate(document.tutorialType === 'device-operation'
        ? '/knowledge/device-operation-videos'
        : '/knowledge/video-tutorials')
      return
    }
    navigate('/knowledge')
  }

  // 加载状态
  if (loading) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-white text-lg">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // 错误状态 — noindex + auto-redirect to knowledge base
  if (error || !document) {
    return (
      <div className="page-container flex items-center justify-center">
        <SEOHead noIndex noFollow title={t('knowledge.documentNotFound')} />
        <div className="text-center max-w-md mx-auto px-4">
          <AlertTriangle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            {t('knowledge.documentNotFound')}
          </h2>
          <p className="text-slate-600 dark:text-gray-300 mb-6">
            {error || t('knowledge.documentNotFoundDesc')}
          </p>
          <Button onClick={handleBack} className="bg-primary-600 hover:bg-primary-700">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('knowledge.backToKnowledge')}
          </Button>
        </div>
      </div>
    )
  }

  // 渲染文档内容
  return (
    <div className="page-container">
      {/* 动态SEO */}
      {document && (
        <SEOHead
          title={document.title}
          description={
            document.introduction
              ? document.introduction.replace(/<[^>]*>/g, '').substring(0, 160)
              : document.description || document.content?.replace(/<[^>]*>/g, '').substring(0, 160)
          }
          keywords={[
            document.brand,
            document.model,
            document.yearRange,
            type === 'vehicle' ? 'vehicle compatibility' : type === 'video' ? 'video tutorial' : 'installation guide'
          ].filter(Boolean) as string[]}
          type={type === 'video' ? 'article' : 'article'}
          image={document.vehicleImage || document.thumbnail || (document as any).basicInfo?.vehicleImage}
        />
      )}
      {document && (
        <>
          <BreadcrumbSchema items={[
            { name: 'Home', path: '/' },
            { name: 'Knowledge', path: '/knowledge' },
            { name: document.title, path: window.location.pathname },
          ]} />
          <ArticleSchema
            title={document.title}
            description={
              document.introduction
                ? document.introduction.replace(/<[^>]*>/g, '').substring(0, 160)
                : document.description || ''
            }
            url={window.location.pathname}
            image={document.vehicleImage || document.thumbnail || (document as any).basicInfo?.vehicleImage}
            datePublished={document.createdAt}
            dateModified={document.updatedAt}
            authorName={document.author}
          />
        </>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {user?.type === 'member' && <div className="mb-5 flex justify-end"><button type="button" onClick={() => void toggleFavorite()} disabled={favoriteBusy} className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${favorited ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-300 text-slate-600 hover:border-rose-200 hover:text-rose-500'} disabled:opacity-50`}><Heart className={`h-4 w-4 ${favorited ? 'fill-current' : ''}`} />{favorited ? '已收藏' : '收藏文章'}</button></div>}
        {/* 根据文档类型渲染不同的查看器 */}
        {document.documentType === 'structured' || document.type === 'structured' ? (
          <StructuredDocumentViewer document={document} onBack={handleBack} />
        ) : document.documentType === 'video' || document.type === 'video' ? (
          <VideoPlayer document={document} onBack={handleBack} />
        ) : (
          <GeneralDocumentViewer document={document} onBack={handleBack} />
        )}
      </div>
    </div>
  )
}

export default DocumentDetail
