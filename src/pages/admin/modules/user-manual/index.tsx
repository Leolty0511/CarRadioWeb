import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Eye,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { apiClient } from '@/services/apiClient'

interface Category {
  _id: string
  name: string
  description?: string
  order?: number
  isActive?: boolean
  manualCount?: number
}

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
  categoryId?: string
  category?: Category
  sortOrder?: number
  isPublished?: boolean
}

type CategoryForm = { name: string; description: string; order: string; isActive: boolean }
type ManualForm = { title: string; productModel: string; categoryId: string; description: string; version: string; sortOrder: string; isPublished: boolean }
type DeleteTarget = { type: 'category'; id: string; name: string; manualCount: number } | { type: 'manual'; id: string; name: string }

const emptyCategory: CategoryForm = { name: '', description: '', order: '0', isActive: true }
const emptyManual: ManualForm = { title: '', productModel: '', categoryId: '', description: '', version: '', sortOrder: '0', isPublished: true }
const panelClass = 'rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
const labelClass = 'mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300'

const UserManualManager: React.FC = () => {
  const [manuals, setManuals] = useState<Manual[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [manualForm, setManualForm] = useState<ManualForm>(emptyManual)
  const [editingManual, setEditingManual] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    const result = await apiClient.get('/user-manual/admin')
    if (result.success) {
      setManuals(result.manuals || [])
      setCategories(result.categories || [])
    } else {
      setError(result.error || '获取数据失败')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filteredManuals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return manuals.filter(manual => {
      const matchesCategory = categoryFilter === 'all'
        || (categoryFilter === 'uncategorized' ? !manual.categoryId : manual.categoryId === categoryFilter)
      const matchesQuery = !normalizedQuery
        || [manual.title, manual.productModel, manual.description, manual.version]
          .some(value => value?.toLowerCase().includes(normalizedQuery))
      return matchesCategory && matchesQuery
    })
  }, [categoryFilter, manuals, query])

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!categoryForm.name.trim()) {return setError('请输入分类名称')}
    setSaving(true)
    setError('')
    const payload = { ...categoryForm, order: Number(categoryForm.order) || 0 }
    const result = editingCategory
      ? await apiClient.put(`/user-manual/categories/${editingCategory}`, payload)
      : await apiClient.post('/user-manual/categories', payload)
    if (result.success) {
      setCategoryForm(emptyCategory)
      setEditingCategory(null)
      await load()
    } else {
      setError(result.error || '保存分类失败')
    }
    setSaving(false)
  }

  const editCategory = (category: Category) => {
    setEditingCategory(category._id)
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      order: String(category.order || 0),
      isActive: category.isActive !== false,
    })
  }

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {return}
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('只能上传 PDF 文件')
      return
    }
    setSaving(true)
    setError('')
    const data = new FormData()
    data.append('file', file)
    data.append('title', manualForm.title)
    data.append('productModel', manualForm.productModel)
    data.append('categoryId', manualForm.categoryId)
    data.append('description', manualForm.description)
    data.append('version', manualForm.version)
    data.append('sortOrder', manualForm.sortOrder)
    data.append('isPublished', String(manualForm.isPublished))
    const result = await apiClient.upload('/user-manual/upload', data, { retries: 0 })
    if (result.success) {
      setManualForm(emptyManual)
      await load()
    } else {
      setError(result.error || '上传失败')
    }
    setSaving(false)
    if (fileRef.current) {fileRef.current.value = ''}
  }

  const saveManual = async (event: React.FormEvent) => {
    event.preventDefault()
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
      categoryId: manual.categoryId || '',
      description: manual.description || '',
      version: manual.version || '',
      sortOrder: String(manual.sortOrder || 0),
      isPublished: manual.isPublished !== false,
    })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) {return}
    setSaving(true)
    setError('')
    const endpoint = deleteTarget.type === 'category'
      ? `/user-manual/categories/${deleteTarget.id}`
      : `/user-manual/${deleteTarget.id}`
    const result = await apiClient.delete(endpoint)
    if (!result.success) {setError(result.error || '删除失败')}
    else {await load()}
    setDeleteTarget(null)
    setSaving(false)
  }

  const cancelManualEdit = () => {
    setEditingManual(null)
    setManualForm(emptyManual)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <FileText className="h-6 w-6" />
            用户手册管理
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">管理产品分类、PDF 手册及前台展示状态</p>
        </div>
        <div className="flex gap-5 text-sm">
          <div><span className="text-gray-400">分类</span><strong className="ml-2 text-gray-900 dark:text-white">{categories.length}</strong></div>
          <div><span className="text-gray-400">手册</span><strong className="ml-2 text-gray-900 dark:text-white">{manuals.length}</strong></div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className={`${panelClass} xl:col-span-5`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"><FolderOpen className="h-5 w-5 text-blue-500" />产品分类</h2>
              <p className="mt-1 text-xs text-gray-500">删除分类后，所属手册会保留为未分类</p>
            </div>
            {editingCategory && (
              <button type="button" onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory) }} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="取消编辑">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <form onSubmit={saveCategory} className="grid grid-cols-2 gap-3 border-b border-gray-200 p-5 dark:border-gray-700">
            <label className="col-span-2">
              <span className={labelClass}>分类名称</span>
              <input value={categoryForm.name} onChange={event => setCategoryForm(current => ({ ...current, name: event.target.value }))} placeholder="例如：FY-T 系列" className="input" required />
            </label>
            <label className="col-span-2">
              <span className={labelClass}>分类描述</span>
              <input value={categoryForm.description} onChange={event => setCategoryForm(current => ({ ...current, description: event.target.value }))} placeholder="用于前台分类页的简短说明" className="input" />
            </label>
            <label>
              <span className={labelClass}>排序</span>
              <input type="number" value={categoryForm.order} onChange={event => setCategoryForm(current => ({ ...current, order: event.target.value }))} className="input" />
            </label>
            <label className="flex items-end pb-3">
              <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={categoryForm.isActive} onChange={event => setCategoryForm(current => ({ ...current, isActive: event.target.checked }))} />
                前台显示
              </span>
            </label>
            <button disabled={saving} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {editingCategory ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingCategory ? '保存分类' : '新增分类'}
            </button>
          </form>

          <div className="max-h-[360px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            {categories.length === 0 && <p className="px-5 py-10 text-center text-sm text-gray-500">暂无分类</p>}
            {categories.map(category => (
              <div key={category._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-gray-900 dark:text-white">{category.name}</span>
                    <span className={`text-xs ${category.isActive === false ? 'text-gray-400' : 'text-emerald-600'}`}>{category.isActive === false ? '已停用' : '已启用'}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{category.manualCount || 0} 份手册{category.description ? ` · ${category.description}` : ''}</p>
                </div>
                <div className="flex flex-none gap-1">
                  <button type="button" onClick={() => editCategory(category)} className="p-2 text-gray-400 hover:text-blue-600" title="编辑"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setDeleteTarget({ type: 'category', id: category._id, name: category.name, manualCount: category.manualCount || 0 })} className="p-2 text-gray-400 hover:text-red-600" title="删除"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panelClass} xl:col-span-7`}>
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">{editingManual ? '编辑手册信息' : '上传新手册'}</h2>
            <p className="mt-1 text-xs text-gray-500">支持 PDF，单个文件最大 50 MB</p>
          </div>
          <form onSubmit={editingManual ? saveManual : event => { event.preventDefault(); fileRef.current?.click() }} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <label>
              <span className={labelClass}>手册标题</span>
              <input value={manualForm.title} onChange={event => setManualForm(current => ({ ...current, title: event.target.value }))} placeholder="输入手册标题" className="input" required />
            </label>
            <label>
              <span className={labelClass}>产品型号</span>
              <input value={manualForm.productModel} onChange={event => setManualForm(current => ({ ...current, productModel: event.target.value }))} placeholder="输入产品型号" className="input" required />
            </label>
            <label>
              <span className={labelClass}>产品分类</span>
              <select value={manualForm.categoryId} onChange={event => setManualForm(current => ({ ...current, categoryId: event.target.value }))} className="input">
                <option value="">未分类</option>
                {categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClass}>版本</span>
              <input value={manualForm.version} onChange={event => setManualForm(current => ({ ...current, version: event.target.value }))} placeholder="可选" className="input" />
            </label>
            <label className="md:col-span-2">
              <span className={labelClass}>产品说明</span>
              <textarea value={manualForm.description} onChange={event => setManualForm(current => ({ ...current, description: event.target.value }))} placeholder="可选，用于说明适用范围或注意事项" className="input min-h-20 resize-y" />
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
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button disabled={saving} type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {editingManual ? <Save className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                {editingManual ? '保存修改' : '选择 PDF 并上传'}
              </button>
              {editingManual && <button type="button" onClick={cancelManualEdit} className="h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">取消</button>}
            </div>
            <input ref={fileRef} type="file" accept=".pdf" onChange={upload} className="hidden" />
          </form>
        </section>
      </div>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">手册列表 <span className="ml-1 text-sm font-normal text-gray-400">{loading ? '' : `${filteredManuals.length}/${manuals.length}`}</span></h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题或型号" className="input h-9 pl-9 sm:w-56" />
            </label>
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="input h-9 sm:w-44">
              <option value="all">全部分类</option>
              <option value="uncategorized">未分类</option>
              {categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
            </select>
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
                  <th className="px-5 py-3 text-left font-medium">分类</th>
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
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.category?.name || '未分类'}</td>
                    <td className="px-5 py-3"><span className={manual.isPublished === false ? 'text-gray-400' : 'text-emerald-600'}>{manual.isPublished === false ? '未发布' : '已发布'}</span></td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.sizeFormatted}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <a href={manual.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-blue-600" title="预览"><Eye className="h-4 w-4" /></a>
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

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-delete-title">
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <h2 id="manual-delete-title" className="text-lg font-semibold text-gray-900 dark:text-white">确认删除</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {deleteTarget.type === 'category'
                ? `确定删除分类“${deleteTarget.name}”吗？${deleteTarget.manualCount > 0 ? `其中 ${deleteTarget.manualCount} 份手册会保留为未分类。` : ''}`
                : `确定删除手册“${deleteTarget.name}”吗？PDF 文件也会一并删除。`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">取消</button>
              <button type="button" disabled={saving} onClick={confirmDelete} className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManualManager
