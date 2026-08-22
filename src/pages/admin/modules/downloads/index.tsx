/**
 * 软件资源管理
 * 资源直接关联主机型号，不再使用旧的软件分类标签。
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Download, ExternalLink, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import canbusSettingsService, { type HeadUnitType } from '@/services/canbusSettingsService'
import { softwareService, type Software } from '@/services/softwareService'

interface SoftwareFormProps {
  initial?: Software
  onSave: (data: Partial<Software>) => Promise<void>
  onCancel: () => void
}

function getHeadUnitTypeId(value: Software['headUnitTypeId']) {
  return typeof value === 'string' ? value : value?._id || ''
}

function SoftwareForm({ initial, onSave, onCancel }: SoftwareFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [downloadUrl, setDownloadUrl] = useState(initial?.downloadUrl ?? '')
  const [importantNote, setImportantNote] = useState(initial?.importantNote ?? '')
  const [headUnitTypeId, setHeadUnitTypeId] = useState(getHeadUnitTypeId(initial?.headUnitTypeId))
  const [headUnitTypes, setHeadUnitTypes] = useState<HeadUnitType[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    canbusSettingsService.getAllHeadUnitTypes().then(setHeadUnitTypes).catch(() => setHeadUnitTypes([]))
  }, [])

  const handleSubmit = async () => {
    if (!name.trim() || !downloadUrl.trim()) {return}
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        downloadUrl: downloadUrl.trim(),
        importantNote: importantNote.trim(),
        headUnitTypeId: headUnitTypeId || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-gray-400">软件名称 *</span>
          <input value={name} onChange={event => setName(event.target.value)} placeholder="例如：系统升级包"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-gray-400">适用主机型号</span>
          <select value={headUnitTypeId} onChange={event => setHeadUnitTypeId(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option value="">通用资源</option>
            {headUnitTypes.filter(type => type.isActive || type._id === headUnitTypeId).map(type => (
              <option key={type._id} value={type._id}>{type.name}</option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-gray-400">下载链接 *</span>
          <input value={downloadUrl} onChange={event => setDownloadUrl(event.target.value)} placeholder="https://..."
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-gray-400">描述</span>
          <textarea value={description} onChange={event => setDescription(event.target.value)} rows={3}
            className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-gray-400">重要提示（可选）</span>
          <input value={importantNote} onChange={event => setImportantNote(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void handleSubmit()} disabled={saving || !name.trim() || !downloadUrl.trim()}>
          <Save className="mr-1 h-4 w-4" />{saving ? '保存中...' : '保存'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export const DownloadsManagement: React.FC = () => {
  const { showToast } = useToast()
  const [softwareList, setSoftwareList] = useState<Software[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSoftware, setEditingSoftware] = useState<Software | undefined>()
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Software | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await softwareService.getList()
      if (result.success && result.data) {
        const data = result.data as { items?: Software[] }
        setSoftwareList(data.items || [])
      } else {
        setSoftwareList([])
      }
    } catch {
      setSoftwareList([])
      showToast({ type: 'error', title: '加载软件下载资源失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  const handleSaveSoftware = async (data: Partial<Software>) => {
    setSaving(true)
    try {
      if (editingSoftware) {
        await softwareService.update(editingSoftware._id, data)
        showToast({ type: 'success', title: '软件资源已更新' })
      } else {
        await softwareService.create(data)
        showToast({ type: 'success', title: '软件资源已创建' })
      }
      setShowForm(false)
      setEditingSoftware(undefined)
      await loadData()
    } catch {
      showToast({ type: 'error', title: '保存软件资源失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await softwareService.delete(id)
      showToast({ type: 'success', title: '软件资源已删除' })
      await loadData()
    } catch {
      showToast({ type: 'error', title: '删除软件资源失败' })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Download className="h-8 w-8 text-sky-500" />
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">下载资源管理</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">资源直接绑定主机型号，不再使用旧分类标签</p>
          </div>
        </div>
        <Button onClick={() => { setEditingSoftware(undefined); setShowForm(true) }}>
          <Plus className="mr-1 h-4 w-4" />添加下载资源
        </Button>
      </div>

      {showForm && (
        <SoftwareForm
          initial={editingSoftware}
          onSave={handleSaveSoftware}
          onCancel={() => { setShowForm(false); setEditingSoftware(undefined) }}
        />
      )}

      {softwareList.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-slate-500 dark:text-gray-400">暂无下载资源</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">软件名称</th>
                <th className="px-4 py-3 text-left font-medium">适用主机型号</th>
                <th className="px-4 py-3 text-left font-medium">描述</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
              {softwareList.map(item => (
                <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-gray-100">{item.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">
                    {typeof item.headUnitTypeId === 'object' && item.headUnitTypeId
                      ? item.headUnitTypeId.name
                      : '通用资源'}
                  </td>
                  <td className="max-w-md px-4 py-3 text-slate-600 dark:text-gray-300">
                    <p className="line-clamp-2">{item.description || '—'}</p>
                    {item.importantNote && <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{item.importantNote}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <a href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-sky-500" title="打开链接"><ExternalLink className="h-4 w-4" /></a>
                      <button type="button" onClick={() => { setEditingSoftware(item); setShowForm(true) }} className="p-2 text-slate-400 hover:text-blue-600" title="编辑"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setDeleteTarget(item)} className="p-2 text-slate-400 hover:text-red-600" title="删除"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saving && <p className="text-sm text-slate-500 dark:text-gray-400">正在保存...</p>}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) { void handleDelete(deleteTarget._id) } }}
        title="删除确认"
        message={`确定删除软件资源“${deleteTarget?.name || ''}”吗？`}
        confirmText="删除"
        cancelText="取消"
        type="danger"
      />
    </div>
  )
}

export default DownloadsManagement
