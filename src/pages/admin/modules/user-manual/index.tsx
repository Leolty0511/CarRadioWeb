import React, { useEffect, useRef, useState } from 'react'
import { Download, Eye, FileText, FolderPlus, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { apiClient } from '@/services/apiClient'

interface Category { _id: string; name: string; description?: string; order?: number; isActive?: boolean }
interface Manual { id: string; name: string; title: string; productModel: string; description?: string; version?: string; sizeFormatted: string; url: string; downloadUrl: string; categoryId?: string; category?: Category }
type CategoryForm = { name: string; description: string; order: string; isActive: boolean }
type ManualForm = { title: string; productModel: string; categoryId: string; description: string; version: string; sortOrder: string; isPublished: boolean }

const emptyCategory: CategoryForm = { name: '', description: '', order: '0', isActive: true }
const emptyManual: ManualForm = { title: '', productModel: '', categoryId: '', description: '', version: '', sortOrder: '0', isPublished: true }

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
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true); setError('')
    const result = await apiClient.get('/user-manual/admin')
    if (result.success) { setManuals(result.manuals || []); setCategories(result.categories || []) } else setError(result.error || '获取数据失败')
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault(); if (!categoryForm.name.trim()) return setError('请输入分类名称')
    setSaving(true); setError('')
    const payload = { ...categoryForm, order: Number(categoryForm.order) || 0 }
    const result = editingCategory ? await apiClient.put(`/user-manual/categories/${editingCategory}`, payload) : await apiClient.post('/user-manual/categories', payload)
    if (result.success) { setCategoryForm(emptyCategory); setEditingCategory(null); await load() } else setError(result.error || '保存分类失败')
    setSaving(false)
  }

  const editCategory = (category: Category) => { setEditingCategory(category._id); setCategoryForm({ name: category.name, description: category.description || '', order: String(category.order || 0), isActive: category.isActive !== false }) }
  const removeCategory = async (id: string) => { if (!window.confirm('删除分类后，手册会转移到未分类，确定继续吗？')) return; const result = await apiClient.delete(`/user-manual/categories/${id}`); if (!result.success) setError(result.error || '删除分类失败'); else await load() }

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('只能上传 PDF 文件'); return }
    setSaving(true); setError('')
    const data = new FormData(); data.append('file', file); data.append('title', manualForm.title); data.append('productModel', manualForm.productModel); data.append('categoryId', manualForm.categoryId); data.append('description', manualForm.description); data.append('version', manualForm.version); data.append('sortOrder', manualForm.sortOrder); data.append('isPublished', String(manualForm.isPublished))
    const result = await apiClient.upload('/user-manual/upload', data, { retries: 0 })
    if (result.success) { setManualForm(emptyManual); await load() } else setError(result.error || '上传失败')
    setSaving(false); if (fileRef.current) fileRef.current.value = ''
  }

  const saveManual = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editingManual) return
    setSaving(true); setError('')
    const result = await apiClient.put(`/user-manual/${editingManual}`, { ...manualForm, sortOrder: Number(manualForm.sortOrder) || 0 })
    if (result.success) { setEditingManual(null); setManualForm(emptyManual); await load() } else setError(result.error || '保存手册失败')
    setSaving(false)
  }
  const editManual = (manual: Manual) => {
    setEditingManual(manual.id)
    setManualForm({ title: manual.title, productModel: manual.productModel, categoryId: manual.categoryId || '', description: manual.description || '', version: manual.version || '', sortOrder: '0', isPublished: true })
  }
  const removeManual = async (manual: Manual) => { if (!window.confirm(`确定删除“${manual.title}”吗？`)) return; const result = await apiClient.delete(`/user-manual/${manual.id}`); if (!result.success) setError(result.error || '删除手册失败'); else await load() }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><FileText className="h-6 w-6" />用户手册管理</h1><p className="text-gray-500 dark:text-gray-400 mt-1">按产品分类管理用户手册 PDF</p></div>
    {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5"><div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FolderPlus className="h-5 w-5 text-blue-500" />手册分类</h2>{editingCategory && <button onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory) }} className="text-sm text-gray-500"><X className="h-4 w-4 inline mr-1" />取消编辑</button>}</div><form onSubmit={saveCategory} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5"><input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="分类名称" className="input" /><input value={categoryForm.description} onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })} placeholder="分类描述（可选）" className="input" /><input type="number" value={categoryForm.order} onChange={e => setCategoryForm({ ...categoryForm, order: e.target.value })} placeholder="排序" className="input" /><label className="inline-flex items-center gap-2 px-3 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={categoryForm.isActive} onChange={e => setCategoryForm({ ...categoryForm, isActive: e.target.checked })} />前台显示</label><button disabled={saving} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{editingCategory ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingCategory ? '保存分类' : '新增分类'}</button></form><div className="divide-y divide-gray-100 dark:divide-gray-700">{categories.map(category => <div key={category._id} className="py-3 flex items-center justify-between gap-3"><div><span className="font-medium text-gray-800 dark:text-white">{category.name}</span><span className={`ml-3 text-xs ${category.isActive === false ? 'text-gray-400' : 'text-green-500'}`}>{category.isActive === false ? '已停用' : '已启用'}</span>{category.description && <span className="ml-3 text-sm text-gray-500">{category.description}</span>}</div><div className="flex gap-1"><button onClick={() => editCategory(category)} className="p-2 text-gray-500 hover:text-blue-500" title="编辑"><Pencil className="h-4 w-4" /></button><button onClick={() => removeCategory(category._id)} className="p-2 text-gray-500 hover:text-red-500" title="删除"><Trash2 className="h-4 w-4" /></button></div></div>)}</div></section>

    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5"><h2 className="font-semibold text-gray-900 dark:text-white mb-4">{editingManual ? '编辑手册信息' : '上传新手册'}</h2><form onSubmit={editingManual ? saveManual : e => { e.preventDefault(); fileRef.current?.click() }} className="grid grid-cols-1 md:grid-cols-2 gap-3"><input value={manualForm.title} onChange={e => setManualForm({ ...manualForm, title: e.target.value })} placeholder="手册标题" className="input" required /><input value={manualForm.productModel} onChange={e => setManualForm({ ...manualForm, productModel: e.target.value })} placeholder="产品型号" className="input" required /><select value={manualForm.categoryId} onChange={e => setManualForm({ ...manualForm, categoryId: e.target.value })} className="input"><option value="">未分类</option>{categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}</select><input value={manualForm.version} onChange={e => setManualForm({ ...manualForm, version: e.target.value })} placeholder="版本（可选）" className="input" /><input value={manualForm.description} onChange={e => setManualForm({ ...manualForm, description: e.target.value })} placeholder="产品说明（可选）" className="input md:col-span-2" /><div className="flex gap-2 md:col-span-2"><button disabled={saving} type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{editingManual ? <Save className="h-4 w-4" /> : <Upload className="h-4 w-4" />}{editingManual ? '保存修改' : '选择 PDF 并上传'}</button>{editingManual && <button type="button" onClick={() => { setEditingManual(null); setManualForm(emptyManual) }} className="px-4 py-2 rounded-lg border text-gray-600">取消</button>}</div><input ref={fileRef} type="file" accept=".pdf" onChange={upload} className="hidden" /></form></section>

    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"><div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700"><h2 className="font-semibold text-gray-900 dark:text-white">手册列表 {loading ? '' : `(${manuals.length})`}</h2></div>{!loading && manuals.length === 0 ? <div className="p-10 text-center text-gray-500">暂无手册</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-900/40"><tr><th className="text-left px-5 py-3">标题</th><th className="text-left px-5 py-3">产品型号</th><th className="text-left px-5 py-3">分类</th><th className="text-left px-5 py-3">大小</th><th className="text-right px-5 py-3">操作</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-700">{manuals.map(manual => <tr key={manual.id}><td className="px-5 py-3 font-medium text-gray-800 dark:text-white">{manual.title}</td><td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.productModel}</td><td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.category?.name || '未分类'}</td><td className="px-5 py-3 text-gray-600 dark:text-gray-400">{manual.sizeFormatted}</td><td className="px-5 py-3"><div className="flex justify-end gap-1"><a href={manual.url} target="_blank" rel="noreferrer" className="p-2 text-gray-500 hover:text-blue-500" title="预览"><Eye className="h-4 w-4" /></a><a href={manual.downloadUrl} className="p-2 text-gray-500 hover:text-green-500" title="下载"><Download className="h-4 w-4" /></a><button onClick={() => editManual(manual)} className="p-2 text-gray-500 hover:text-blue-500" title="编辑"><Pencil className="h-4 w-4" /></button><button onClick={() => removeManual(manual)} className="p-2 text-gray-500 hover:text-red-500" title="删除"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>}</section>
  </div>
}

export default UserManualManager
