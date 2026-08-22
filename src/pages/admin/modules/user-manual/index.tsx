import React, { useEffect, useMemo, useState } from 'react'
import {
  Download,
  Eye,
  FileText,
  Pencil,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { apiClient } from '@/services/apiClient'
import Modal from '@/components/ui/Modal'
import { FormModal } from '../../components/FormModal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import canbusSettingsService, { type HeadUnitType } from '@/services/canbusSettingsService'

interface Manual {
  id: string
  name: string
  title: string
  productModel: string
  description?: string
  version?: string
  sizeFormatted: string
  url: string
  downloadUrl: string
  headUnitTypeId?: string | null
  headUnitType?: { _id: string; name: string }
  sortOrder?: number
  isPublished?: boolean
}

type ManualForm = { title: string; productModel: string; headUnitTypeId: string; description: string; version: string; sortOrder: string; isPublished: boolean }
type DeleteTarget = { type: 'manual'; id: string; name: string }

const emptyManual: ManualForm = { title: '', productModel: '', headUnitTypeId: '', description: '', version: '', sortOrder: '0', isPublished: true }
const panelClass = 'rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
const labelClass = 'mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300'

const UserManualManager: React.FC = () => {
  const [manuals, setManuals] = useState<Manual[]>([])
  const [manualForm, setManualForm] = useState<ManualForm>(emptyManual)
  const [editingManual, setEditingManual] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [previewManual, setPreviewManual] = useState<Manual | null>(null)
  const [headUnitTypes, setHeadUnitTypes] = useState<HeadUnitType[]>([])

  const load = async () => {
    setLoading(true)
    setError('')
    const result = await apiClient.get('/user-manual/admin')
    if (result.success) {
      setManuals(result.manuals || [])
    } else {
      setError(result.error || '获取数据失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    canbusSettingsService.getAllHeadUnitTypes().then(setHeadUnitTypes).catch(() => setHeadUnitTypes([]))
  }, [])

  const filteredManuals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return manuals.filter(manual => {
      const matchesQuery = !normalizedQuery
        || [manual.title, manual.productModel, manual.description, manual.version]
          .some(value => value?.toLowerCase().includes(normalizedQuery))
      return matchesQuery
    })
  }, [manuals, query])

  const selectManualFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {return}
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('只能上传 PDF 文件')
      return
    }
    setManualFile(file)
    setError('')
  }

  const uploadManual = async () => {
    const file = manualFile
    if (!file) {return setError('请先选择 PDF 文件')}
    setSaving(true)
    setError('')
    const data = new FormData()
    data.append('file', file)
    data.append('title', manualForm.title)
    data.append('productModel', manualForm.productModel)
    data.append('headUnitTypeId', manualForm.headUnitTypeId)
    data.append('description', manualForm.description)
    data.append('version', manualForm.version)
    data.append('sortOrder', manualForm.sortOrder)
    data.append('isPublished', String(manualForm.isPublished))
    const result = await apiClient.upload('/user-manual/upload', data, { retries: 0 })
    if (result.success) {
      setManualForm(emptyManual)
      setManualFile(null)
      setShowManualModal(false)
      await load()
    } else {
      setError(result.error || '上传失败')
    }
    setSaving(false)
  }

  const saveManual = async () => {
    if (!editingManual) {return}
    setSaving(true)
    setError('')
    const result = await apiClient.put(`/user-manual/${editingManual}`, {
      ...manualForm,
      sortOrder: Number(manualForm.sortOrder) || 0,
    })
    if (result.success) {
      setEditingManual(null)
      setManualForm(emptyManual)
      setShowManualModal(false)
      await load()
    } else {
      setError(result.error || '保存手册失败')
    }
    setSaving(false)
  }

  const editManual = (manual: Manual) => {
    setEditingManual(manual.id)
    setManualForm({
      title: manual.title,
      productModel: manual.productModel,
      headUnitTypeId: manual.headUnitTypeId || '',
      description: manual.description || '',
      version: manual.version || '',
      sortOrder: String(manual.sortOrder || 0),
      isPublished: manual.isPublished !== false,
    })
    setManualFile(null)
    setShowManualModal(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) {return}
    setSaving(true)
    setError('')
    const endpoint = `/user-manual/${deleteTarget.id}`
    const result = await apiClient.delete(endpoint)
    if (!result.success) {setError(result.error || '删除失败')}
    else {await load()}
    setDeleteTarget(null)
    setSaving(false)
  }

  const cancelManualEdit = () => {
    setEditingManual(null)
    setManualForm(emptyManual)
    setManualFile(null)
    setShowManualModal(false)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <FileText className="h-6 w-6" />
            用户手册管理
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">管理按主机型号关联的 PDF 手册及前台展示状态</p>
        </div>
        <div className="flex gap-5 text-sm">
          <div><span className="text-gray-400">手册</span><strong className="ml-2 text-gray-900 dark:text-white">{manuals.length}</strong></div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <section className={`${panelClass} flex min-h-[260px] flex-col`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">PDF 手册</h2>
              <p className="mt-1 text-xs text-gray-500">支持 PDF，单个文件最大 50 MB</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditingManual(null); setManualForm(emptyManual); setManualFile(null); setShowManualModal(true) }}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Upload className="h-4 w-4" />上传手册
            </button>
          </div>
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <FileText className="h-7 w-7" />
              </div>
              <p className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{manuals.length} 份手册</p>
              <p className="mt-1 text-sm text-gray-500">上传后可在下方列表中预览、编辑、下载或删除</p>
            </div>
          </div>
      </section>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">手册列表 <span className="ml-1 text-sm font-normal text-gray-400">{loading ? '' : `${filteredManuals.length}/${manuals.length}`}</span></h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题或型号" className="input h-9 pl-9 sm:w-56" />
            </label>
          </div>
        </div>
        {!loading && filteredManuals.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">没有符合条件的手册</div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">标题</th>
                  <th className="px-5 py-3 text-left font-medium">产品型号</th>
                  <th className="px-5 py-3 text-left font-medium">适用主机型号</th>
                  <th className="px-5 py-3 text-left font-medium">状态</th>
                  <th className="px-5 py-3 text-left font-medium">大小</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredManuals.map(manual => (
                  <tr key={manual.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/30">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{manual.title}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.productModel}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.headUnitType?.name || '通用手册'}</td>
                    <td className="px-5 py-3"><span className={manual.isPublished === false ? 'text-gray-400' : 'text-emerald-600'}>{manual.isPublished === false ? '未发布' : '已发布'}</span></td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.sizeFormatted}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setPreviewManual(manual)} className="p-2 text-gray-400 hover:text-blue-600" title="预览"><Eye className="h-4 w-4" /></button>
                        <a href={manual.downloadUrl} className="p-2 text-gray-400 hover:text-emerald-600" title="下载"><Download className="h-4 w-4" /></a>
                        <button type="button" onClick={() => editManual(manual)} className="p-2 text-gray-400 hover:text-blue-600" title="编辑"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeleteTarget({ type: 'manual', id: manual.id, name: manual.title })} className="p-2 text-gray-400 hover:text-red-600" title="删除"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FormModal
        open={showManualModal}
        onClose={cancelManualEdit}
        onSubmit={() => void (editingManual ? saveManual() : uploadManual())}
        title={editingManual ? '编辑用户手册' : '上传用户手册'}
        submitText={editingManual ? '保存修改' : '上传手册'}
        loading={saving}
        size="lg"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {!editingManual && (
            <label className="md:col-span-2">
              <span className={labelClass}>PDF 文件</span>
              <input type="file" accept="application/pdf,.pdf" onChange={selectManualFile} className="input py-2" required />
              <span className="mt-1.5 block text-xs text-gray-500">{manualFile ? manualFile.name : '单个文件最大 50 MB'}</span>
            </label>
          )}
          <label>
            <span className={labelClass}>手册标题</span>
            <input value={manualForm.title} onChange={event => setManualForm(current => ({ ...current, title: event.target.value }))} placeholder="输入手册标题" className="input" required />
          </label>
          <label>
            <span className={labelClass}>产品型号</span>
            <input value={manualForm.productModel} onChange={event => setManualForm(current => ({ ...current, productModel: event.target.value }))} placeholder="输入产品型号" className="input" required />
          </label>
          <label>
            <span className={labelClass}>适用主机型号</span>
            <select value={manualForm.headUnitTypeId} onChange={event => setManualForm(current => ({ ...current, headUnitTypeId: event.target.value }))} className="input">
              <option value="">通用手册</option>
              {headUnitTypes.filter(type => type.isActive || type._id === manualForm.headUnitTypeId).map(type => (
                <option key={type._id} value={type._id}>{type.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>版本</span>
            <input value={manualForm.version} onChange={event => setManualForm(current => ({ ...current, version: event.target.value }))} placeholder="可选" className="input" />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>产品说明</span>
            <textarea value={manualForm.description} onChange={event => setManualForm(current => ({ ...current, description: event.target.value }))} placeholder="可选，用于说明适用范围或注意事项" className="input min-h-24 resize-y" />
          </label>
          <label>
            <span className={labelClass}>排序</span>
            <input type="number" value={manualForm.sortOrder} onChange={event => setManualForm(current => ({ ...current, sortOrder: event.target.value }))} className="input" />
          </label>
          <label className="flex items-end pb-3">
            <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={manualForm.isPublished} onChange={event => setManualForm(current => ({ ...current, isPublished: event.target.checked }))} />
              前台发布
            </span>
          </label>
        </div>
      </FormModal>

      <Modal isOpen={Boolean(previewManual)} onClose={() => setPreviewManual(null)} title={previewManual?.title || '预览用户手册'} size="full">
        {previewManual && <iframe title={previewManual.title} src={previewManual.url} className="h-[calc(95vh-10rem)] w-full rounded-md border border-gray-200 dark:border-gray-700" />}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="确认删除"
        message={`确定删除手册“${deleteTarget?.name || ''}”吗？PDF 文件也会一并删除。`}
        confirmText="删除"
        cancelText="取消"
        danger
        loading={saving}
      />
    </div>
  )
}

export default UserManualManager
