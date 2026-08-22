import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import ImageUpload from '@/components/ImageUpload'
import LazyRichTextEditor from '@/components/LazyRichTextEditor'
import { deleteDraft, loadDraft, saveDraft } from '@/services/draftService'
import { getVehicles } from '@/services/vehicleService'

type TutorialLayout = 'imageLeft' | 'imageRight'

interface TutorialSection {
  id: string
  heading: string
  content: string
  imageUrl: string
  imageAlt: string
  layout: TutorialLayout
}

interface ArticleFAQ {
  id: string
  title: string
  description: string
  images: string[]
}

interface ArticleFormData {
  title: string
  author: string
  basicInfo: {
    brand: string
    model: string
    yearRange: string
    vehicleImage: string
    introduction: string
    importantNotes: string
  }
  tutorialSections: TutorialSection[]
  faqs: ArticleFAQ[]
}

interface StructuredArticleEditorProps {
  article?: any
  onSave: (article: any) => void
  onCancel: () => void
}

const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const normalizeSection = (section: any, index: number): TutorialSection => ({
  id: section?.id || createId(`tutorial_${index}`),
  heading: section?.heading || section?.title || '',
  content: section?.content || section?.description || '',
  imageUrl: section?.imageUrl || section?.image || '',
  imageAlt: section?.imageAlt || '',
  layout: section?.layout === 'imageRight' ? 'imageRight' : 'imageLeft',
})

const normalizeFAQ = (faq: any, index: number): ArticleFAQ => ({
  id: faq?.id || createId(`faq_${index}`),
  title: faq?.title || faq?.question || '',
  description: faq?.description || faq?.answer || '',
  images: Array.isArray(faq?.images) ? faq.images : [],
})

const initialFormData = (article?: any): ArticleFormData => ({
  title: article?.title || article?.basicInfo?.title || '',
  author: article?.author || 'Technical Team',
  basicInfo: {
    brand: article?.basicInfo?.brand || article?.brand || '',
    model: article?.basicInfo?.model || article?.model || '',
    yearRange: article?.basicInfo?.yearRange || article?.yearRange || '',
    vehicleImage: article?.basicInfo?.vehicleImage || article?.vehicleImage || '',
    introduction: article?.basicInfo?.introduction || article?.introduction || '',
    importantNotes: article?.basicInfo?.importantNotes || article?.importantNotes || '',
  },
  tutorialSections: Array.isArray(article?.tutorialSections) ? article.tutorialSections.map(normalizeSection) : [],
  faqs: Array.isArray(article?.faqs) ? article.faqs.map(normalizeFAQ) : [],
})

const hasVisibleContent = (value: string) =>
  value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim().length > 0 || /<(img|video|iframe)\b/i.test(value)

const StructuredArticleEditor: React.FC<StructuredArticleEditorProps> = ({ article, onSave, onCancel }) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [formData, setFormData] = useState<ArticleFormData>(() => initialFormData(article))
  const [vehicles, setVehicles] = useState<any[]>([])
  const [activeStep, setActiveStep] = useState(0)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  const steps = useMemo(() => [
    t('admin.structuredArticle.basicInfo'),
    t('admin.structuredArticle.wiringTutorial'),
    t('admin.structuredArticle.faqs'),
  ], [t])

  useEffect(() => {
    setFormData(initialFormData(article))
    setActiveStep(0)
  }, [article])

  useEffect(() => {
    let mounted = true
    getVehicles().then(list => {
      if (mounted) {setVehicles(list || [])}
    }).catch(() => {
      if (mounted) {setVehicles([])}
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!article && !formData.title && !formData.basicInfo.introduction) {return}
    const timer = window.setTimeout(() => {
      setAutoSaveStatus('saving')
      saveDraft('structured', formData, article?._id || article?.id)
      setAutoSaveStatus('saved')
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [article, formData])

  useEffect(() => {
    if (article) {return}
    const draft = loadDraft('structured', undefined)
    if (draft?.formData && window.confirm(t('admin.structuredArticle.restoreDraft'))) {
      const empty = initialFormData()
      setFormData({
        ...empty,
        ...draft.formData,
        basicInfo: { ...empty.basicInfo, ...draft.formData.basicInfo },
        tutorialSections: (draft.formData.tutorialSections || []).map(normalizeSection),
        faqs: (draft.formData.faqs || []).map(normalizeFAQ),
      })
    }
  }, [article, t])

  const updateBasicInfo = useCallback((field: keyof ArticleFormData['basicInfo'], value: string) => {
    setAutoSaveStatus('unsaved')
    setFormData(current => ({ ...current, basicInfo: { ...current.basicInfo, [field]: value } }))
  }, [])

  const addTutorialSection = () => {
    setFormData(current => ({
      ...current,
      tutorialSections: [...current.tutorialSections, {
        id: createId('tutorial'), heading: '', content: '', imageUrl: '', imageAlt: '',
        layout: current.tutorialSections.length % 2 === 0 ? 'imageLeft' : 'imageRight',
      }],
    }))
  }

  const updateTutorialSection = (id: string, field: keyof TutorialSection, value: string) => {
    setFormData(current => ({
      ...current,
      tutorialSections: current.tutorialSections.map(section => section.id === id ? { ...section, [field]: value } : section),
    }))
  }

  const moveTutorialSection = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= formData.tutorialSections.length) {return}
    setFormData(current => {
      const next = [...current.tutorialSections]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...current, tutorialSections: next }
    })
  }

  const removeTutorialSection = (id: string) => {
    setFormData(current => ({ ...current, tutorialSections: current.tutorialSections.filter(section => section.id !== id) }))
  }

  const addFAQ = () => {
    setFormData(current => ({ ...current, faqs: [...current.faqs, { id: createId('faq'), title: '', description: '', images: [] }] }))
  }

  const updateFAQ = (id: string, field: keyof ArticleFAQ, value: string | string[]) => {
    setFormData(current => ({ ...current, faqs: current.faqs.map(faq => faq.id === id ? { ...faq, [field]: value } : faq) }))
  }

  const removeFAQ = (id: string) => {
    setFormData(current => ({ ...current, faqs: current.faqs.filter(faq => faq.id !== id) }))
  }

  const validate = (): string | null => {
    const { basicInfo } = formData
    if (!formData.title.trim() || !basicInfo.brand.trim() || !basicInfo.model.trim() || !basicInfo.yearRange.trim()) {
      return t('admin.structuredArticle.validation.basicInfoRequired')
    }
    if (!hasVisibleContent(basicInfo.introduction)) {return t('admin.structuredArticle.validation.introductionRequired')}
    if (formData.tutorialSections.length === 0) {return t('admin.structuredArticle.validation.tutorialRequired')}
    const invalidTutorial = formData.tutorialSections.findIndex(section => !section.heading.trim() || !hasVisibleContent(section.content))
    if (invalidTutorial >= 0) {return t('admin.structuredArticle.validation.tutorialIncomplete', { index: invalidTutorial + 1 })}
    const invalidFAQ = formData.faqs.findIndex(faq => !faq.title.trim() || !hasVisibleContent(faq.description))
    if (invalidFAQ >= 0) {return t('admin.structuredArticle.validation.faqIncomplete', { index: invalidFAQ + 1 })}
    return null
  }

  const handleSave = () => {
    const error = validate()
    if (error) {
      showToast({ type: 'error', title: t('common.error'), description: error })
      return
    }
    const basicInfo = {
      ...formData.basicInfo,
      brand: formData.basicInfo.brand.trim(), model: formData.basicInfo.model.trim(), yearRange: formData.basicInfo.yearRange.trim(),
    }
    deleteDraft('structured', (article?._id || article?.id)?.toString())
    onSave({
      type: 'structured', title: formData.title.trim(), author: formData.author.trim() || 'Technical Team', basicInfo, ...basicInfo,
      tutorialSections: formData.tutorialSections.map(section => ({ ...section, heading: section.heading.trim() })),
      faqs: formData.faqs.map(faq => ({ ...faq, title: faq.title.trim() })),
      features: { supported: [], unsupported: [] }, supportedFeatures: [], unsupportedFeatures: [],
      compatibleModels: [], incompatibleModels: [], userFeedback: article?.userFeedback || [],
    })
  }

  const renderBasicInfo = () => {
    const selectedValue = `${formData.basicInfo.brand}|${formData.basicInfo.model}|${formData.basicInfo.yearRange}`
    return <Card>
      <CardHeader><CardTitle>{t('admin.structuredArticle.basicInfo')}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.title')}</label><Input value={formData.title} onChange={event => setFormData(current => ({ ...current, title: event.target.value }))} /></div>
          <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('knowledge.author')}</label><Input value={formData.author} onChange={event => setFormData(current => ({ ...current, author: event.target.value }))} /></div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.selectVehicle')}</label>
            <select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white" value={selectedValue === '||' ? '' : selectedValue} onChange={event => {
              const vehicle = vehicles.find(item => `${item.brand}|${item.model || item.modelName}|${item.year}` === event.target.value)
              updateBasicInfo('brand', vehicle?.brand || ''); updateBasicInfo('model', vehicle?.model || vehicle?.modelName || ''); updateBasicInfo('yearRange', vehicle?.year || '')
            }}>
              <option value="">{t('admin.structuredArticle.selectVehiclePlaceholder')}</option>
              {vehicles.map(vehicle => { const model = vehicle.model || vehicle.modelName || ''; const value = `${vehicle.brand}|${model}|${vehicle.year}`; return <option key={vehicle.id || vehicle._id || value} value={value}>{vehicle.brand} {model} {vehicle.year}</option> })}
            </select>
          </div>
        </div>
        <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.vehicleImage')}</label><ImageUpload value={formData.basicInfo.vehicleImage} onChange={value => updateBasicInfo('vehicleImage', value)} imageType="structured-article" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.introduction')}</label><LazyRichTextEditor value={formData.basicInfo.introduction} onChange={value => updateBasicInfo('introduction', value)} /></div>
        <div><label className="mb-2 block text-sm font-medium text-red-600 dark:text-red-400">{t('admin.structuredArticle.importantNotes')}</label><LazyRichTextEditor value={formData.basicInfo.importantNotes} onChange={value => updateBasicInfo('importantNotes', value)} /></div>
      </CardContent>
    </Card>
  }

  const renderTutorial = () => <div className="space-y-4">
    {formData.tutorialSections.map((section, index) => <Card key={section.id}>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">{t('admin.structuredArticle.tutorialSection', { index: index + 1 })}</CardTitle><div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => updateTutorialSection(section.id, 'layout', section.layout === 'imageLeft' ? 'imageRight' : 'imageLeft')}>{t('admin.structuredArticle.switchLayout')}</Button>
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => moveTutorialSection(index, -1)}>{t('common.moveUp')}</Button>
        <Button variant="outline" size="sm" disabled={index === formData.tutorialSections.length - 1} onClick={() => moveTutorialSection(index, 1)}>{t('common.moveDown')}</Button>
        <Button variant="outline" size="sm" onClick={() => removeTutorialSection(section.id)}>{t('common.delete')}</Button>
      </div></div></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.sectionTitle')}</label><Input value={section.heading} onChange={event => updateTutorialSection(section.id, 'heading', event.target.value)} /></div><div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.sectionImage')}</label><ImageUpload value={section.imageUrl} onChange={value => updateTutorialSection(section.id, 'imageUrl', value)} uploadFolder="knowledge" imageType="general" />{section.imageUrl && <Input className="mt-2" value={section.imageAlt} onChange={event => updateTutorialSection(section.id, 'imageAlt', event.target.value)} placeholder={t('admin.structuredArticle.imageDescription')} />}</div></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('admin.structuredArticle.sectionContent')}</label><LazyRichTextEditor value={section.content} onChange={value => updateTutorialSection(section.id, 'content', value)} /></div>
      </CardContent>
    </Card>)}
    {formData.tutorialSections.length === 0 && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">{t('admin.structuredArticle.noTutorialSections')}</div>}
    <Button onClick={addTutorialSection}>{t('admin.structuredArticle.addTutorialSection')}</Button>
  </div>

  const renderFAQs = () => <div className="space-y-4">
    {formData.faqs.map((faq, index) => <Card key={faq.id}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">{t('admin.structuredArticle.faqItem', { index: index + 1 })}</CardTitle><Button variant="outline" size="sm" onClick={() => removeFAQ(faq.id)}>{t('common.delete')}</Button></div></CardHeader><CardContent className="space-y-4"><Input value={faq.title} onChange={event => updateFAQ(faq.id, 'title', event.target.value)} placeholder={t('admin.structuredArticle.faqQuestion')} /><LazyRichTextEditor value={faq.description} onChange={value => updateFAQ(faq.id, 'description', value)} /><ImageUpload value={faq.images[0] || ''} onChange={value => updateFAQ(faq.id, 'images', value ? [value] : [])} uploadFolder="knowledge" imageType="structured-article" /></CardContent></Card>)}
    {formData.faqs.length === 0 && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">{t('admin.structuredArticle.noFaqs')}</div>}
    <Button onClick={addFAQ}>{t('admin.structuredArticle.addFaq')}</Button>
  </div>

  return <div className="flex h-full min-h-[620px] flex-col bg-slate-50 dark:bg-slate-950">
    <div className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('admin.structuredArticle.wiringGuideEditor')}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{autoSaveStatus === 'saving' ? t('common.saving') : autoSaveStatus === 'saved' ? t('common.saved') : t('common.unsaved')}</p></div><div className="flex gap-2"><Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button><Button onClick={handleSave}>{t('common.save')}</Button></div></div>
      <div className="mt-4 grid grid-cols-3 gap-2" role="tablist">{steps.map((step, index) => <button key={step} type="button" role="tab" aria-selected={activeStep === index} onClick={() => setActiveStep(index)} className={`min-h-10 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${activeStep === index ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{index + 1}. {step}</button>)}</div>
    </div>
    <div className="flex-1 overflow-y-auto p-5">{activeStep === 0 ? renderBasicInfo() : activeStep === 1 ? renderTutorial() : renderFAQs()}</div>
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><Button variant="outline" disabled={activeStep === 0} onClick={() => setActiveStep(current => current - 1)}>{t('common.previous')}</Button>{activeStep === steps.length - 1 ? <Button onClick={handleSave}>{t('common.save')}</Button> : <Button onClick={() => setActiveStep(current => current + 1)}>{t('common.next')}</Button>}</div>
  </div>
}

export default StructuredArticleEditor
