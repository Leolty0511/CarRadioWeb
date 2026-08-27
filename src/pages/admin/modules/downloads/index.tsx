/**
 * 软件资源管理
 * 资源直接关联主机型号，不再使用旧的软件分类标签。
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FilterChipBar from '@/components/knowledge/FilterChipBar'
import canbusSettingsService, { type HeadUnitType } from '@/services/canbusSettingsService'
import { softwareService, type Software } from '@/services/softwareService'

const ALL_FILTER = '__all__'
const GENERAL_FILTER = '__general__'

interface SoftwareFormProps {
  initial?: Software
  onSave: (data: Partial<Software>) => Promise<void>
  onCancel: () => void
}

function getHeadUnitTypeId(value: Software['headUnitTypeId']) {
  return typeof value === 'string' ? value : value?._id || ''
}

function getHeadUnitTypeName(value: Software['headUnitTypeId']) {
  return typeof value === 'object' && value ? value.name : ''
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
    if (!name.trim() || !downloadUrl.trim()) {
      return
    }
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
          {saving ? '保存中' : '保存'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}

export const DownloadsManagement: React.FC = () => {
  const { showToast } = useToast()
  const [softwareList, setSoftwareList] = useState<Software[]>([])
  const [headUnitTypes, setHeadUnitTypes] = useState<HeadUnitType[]>([])
  const [filter, setFilter] = useState(ALL_FILTER)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSoftware, setEditingSoftware] = useState<Software | undefined>()
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Software | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [result, types] = await Promise.all([
        softwareService.getList(),
        canbusSettingsService.getAllHeadUnitTypes()
      ])
      if (result.success && result.data) {
        const data = result.data as { items?: Software[] }
        setSoftwareList(data.items || [])
      } else {
        setSoftwareList([])
      }
      setHeadUnitTypes(types)
    } catch {
      setSoftwareList([])
      setHeadUnitTypes([])
      showToast({ type: 'error', title: '加载软件下载资源失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  const filterChips = useMemo(() => {
    const counts: Record<string, number> = {
      [ALL_FILTER]: softwareList.length,
      [GENERAL_FILTER]: softwareList.filter(item => !getHeadUnitTypeId(item.headUnitTypeId)).length
    }
    for (const type of headUnitTypes) {
      counts[type._id] = softwareList.filter(item => getHeadUnitTypeId(item.headUnitTypeId) === type._id).length
    }
    return [
      { id: ALL_FILTER, label: `全部 (${counts[ALL_FILTER]})` },
      { id: GENERAL_FILTER, label: `通用资源 (${counts[GENERAL_FILTER]})` },
      ...headUnitTypes.map(type => ({
        id: type._id,
        label: `${type.name} (${counts[type._id] || 0})`
      }))
    ]
  }, [softwareList, headUnitTypes])

  const filteredList = softwareList.filter(item => {
    if (filter === ALL_FILTER) {
      return true
    }
    if (filter === GENERAL_FILTER) {
      return !getHeadUnitTypeId(item.headUnitTypeId)
    }
    return getHeadUnitTypeId(item.headUnitTypeId) === filter
  })

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
    return <p className="py-20 text-center text-sm text-slate-500 dark:text-gray-400">加载中...</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">下载资源管理</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">资源直接绑定主机型号，点击标签筛选列表</p>
        </div>
        <Button onClick={() => { setEditingSoftware(undefined); setShowForm(true) }}>
          添加下载资源
        </Button>
      </div>

      <FilterChipBar
        label="适用主机型号"
        ariaLabel="适用主机型号"
        items={filterChips}
        selectedId={filter}
        onSelect={setFilter}
      />

      {showForm && (
        <SoftwareForm
          initial={editingSoftware}
          onSave={handleSaveSoftware}
          onCancel={() => { setShowForm(false); setEditingSoftware(undefined) }}
        />
      )}

      {filteredList.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">暂无下载资源</p>
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
              {filteredList.map(item => (
                <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-gray-100">{item.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">
                    {getHeadUnitTypeName(item.headUnitTypeId) || '通用资源'}
                  </td>
                  <td className="max-w-md px-4 py-3 text-slate-600 dark:text-gray-300">
                    <p className="line-clamp-2">{item.description || '—'}</p>
                    {item.importantNote ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{item.importantNote}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <a href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-700 hover:underline dark:text-cyan-300">打开</a>
                      <button type="button" onClick={() => { setEditingSoftware(item); setShowForm(true) }} className="text-sm text-slate-600 hover:text-slate-900 dark:text-gray-300">编辑</button>
                      <button type="button" onClick={() => setDeleteTarget(item)} className="text-sm text-red-500 hover:text-red-400">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saving ? <p className="text-sm text-slate-500 dark:text-gray-400">正在保存...</p> : null}
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
