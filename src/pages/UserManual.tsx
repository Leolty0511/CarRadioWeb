import React, { useEffect, useState } from 'react'
import { ArrowLeft, Download, ExternalLink, FileText, FolderOpen, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import SEOHead from '@/components/seo/SEOHead'

interface Category { _id: string; name: string; description?: string; manualCount?: number }
interface Manual {
  id: string; name: string; title: string; productModel: string; description?: string; version?: string
  sizeFormatted: string; url: string; downloadUrl: string; categoryId?: string
}

const UserManual: React.FC = () => {
  const { t } = useTranslation()
  const [categories, setCategories] = useState<Category[]>([])
  const [manuals, setManuals] = useState<Manual[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedManual, setSelectedManual] = useState<Manual | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoading, setIframeLoading] = useState(false)

  useEffect(() => {
    fetch('/api/user-manual/categories').then(response => response.json()).then(data => {
      if (data.success) setCategories(data.categories || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const openCategory = async (category: Category) => {
    setLoading(true)
    setSelectedCategory(category)
    setSelectedManual(null)
    try {
      const response = await fetch(`/api/user-manual?categoryId=${encodeURIComponent(category._id)}`)
      const data = await response.json()
      if (data.success) setManuals(data.manuals || [])
    } catch (error) { console.error(error) } finally { setLoading(false) }
  }

  const goBack = () => { setSelectedCategory(null); setSelectedManual(null); setManuals([]) }

  return <div className="page-container">
    <SEOHead title={t('userManual.title')} description={t('userManual.description')} keywords={['user manual', 'product manual', 'PDF']} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-500 dark:text-blue-400 text-sm font-medium mb-4"><FileText className="h-4 w-4 mr-2" />{t('userManual.badge')}</div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-white mb-3">{t('userManual.title')}</h1>
        <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">{t('userManual.description')}</p>
      </div>

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}
      {!loading && !selectedCategory && categories.length === 0 && <EmptyState title={t('userManual.noManuals')} description={t('userManual.noManualsDesc')} />}
      {!loading && !selectedCategory && categories.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {categories.map(category => <Card key={category._id} hoverable onClick={() => openCategory(category)} className="cursor-pointer group"><CardContent className="p-6"><div className="flex items-start gap-4"><div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors"><FolderOpen className="h-7 w-7" /></div><div className="min-w-0"><h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{category.name}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{category.description || '查看该产品分类下的用户手册'}</p><span className="inline-block mt-3 text-xs text-blue-500">{category.manualCount || 0} 份手册</span></div></div></CardContent></Card>)}
      </div>}

      {!loading && selectedCategory && !selectedManual && <>
        <button onClick={goBack} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-500 mb-5"><ArrowLeft className="h-4 w-4" />返回分类</button>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-5">{selectedCategory.name}</h2>
        {manuals.length === 0 ? <EmptyState title="暂无手册" description="该分类还没有已发布的用户手册" /> : <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{manuals.map(manual => <Card key={manual.id} hoverable onClick={() => { setSelectedManual(manual); setIframeLoading(true) }} className="cursor-pointer"><CardContent className="p-6"><div className="flex items-start gap-4"><FileText className="h-8 w-8 text-blue-500 flex-shrink-0" /><div className="min-w-0"><h3 className="font-semibold text-gray-900 dark:text-white">{manual.title}</h3><p className="text-sm text-gray-500 mt-1">型号：{manual.productModel}</p>{manual.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 line-clamp-3">{manual.description}</p>}<div className="flex gap-3 mt-4 text-xs text-gray-400"><span>{manual.sizeFormatted}</span>{manual.version && <span>版本 {manual.version}</span>}</div></div></div></CardContent></Card>)}</div>}
      </>}

      {selectedManual && <div className="space-y-4"><button onClick={() => setSelectedManual(null)} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-500"><ArrowLeft className="h-4 w-4" />返回手册列表</button><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{selectedManual.title}</h2><p className="text-sm text-gray-500 mt-1">型号：{selectedManual.productModel}{selectedManual.version ? ` · 版本 ${selectedManual.version}` : ''}</p></div><div className="flex gap-2"><Button onClick={() => { window.location.href = selectedManual.downloadUrl }}><Download className="h-4 w-4 mr-2" />{t('userManual.download')}</Button><Button variant="outline" onClick={() => window.open(selectedManual.url, '_blank')}><ExternalLink className="h-4 w-4 mr-2" />{t('userManual.openInNewTab')}</Button></div></div><Card className="overflow-hidden"><CardContent className="p-0"><div className="relative w-full bg-gray-100 dark:bg-gray-900" style={{ height: '80vh', minHeight: '600px' }}>{iframeLoading && <div className="absolute inset-0 flex items-center justify-center z-10"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}<iframe src={`${selectedManual.url}#toolbar=0&navpanes=0&scrollbar=1`} className="w-full h-full border-0" title={selectedManual.title} onLoad={() => setIframeLoading(false)} /></div></CardContent></Card></div>}
    </div>
  </div>
}

function EmptyState({ title, description }: { title: string; description: string }) { return <Card><CardContent className="p-12 text-center"><FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" /><h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{title}</h2><p className="text-gray-500 dark:text-gray-400">{description}</p></CardContent></Card> }

export default UserManual
