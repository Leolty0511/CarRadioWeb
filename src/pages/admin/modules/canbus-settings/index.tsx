/**
 * CANBus 设置管理模块
 * Tab 1: CANBox 类型管理（产品图片展示库）
 * Tab 2: 设置图片管理（车型 → 设置图片 + 描述）
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Settings, Trash2, Edit2, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import canbusSettingsService, {
  type CANBoxType,
  type CANBusSetting,
  type CANBoxTypeInput,
  type CANBusSettingInput,
  type HeadUnitType,
  type HeadUnitTypeInput
} from '@/services/canbusSettingsService'
import { getVehicles, type Vehicle } from '@/services/vehicleService'
import ImagePicker from '@/components/ImagePicker'
import type { DataLanguage } from '../../hooks/useDataLanguage'

interface CANBusSettingsManagementProps {
  dataLanguage: DataLanguage
}

type TabType = 'canbox-types' | 'head-unit-types' | 'settings'

function PageIntroEditor() {
  const { showToast } = useToast()
  const [en, setEn] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await canbusSettingsService.getAdminPageIntro()
        setEn(data.en || data.zh || '')
      } catch {
        showToast({ type: 'error', title: '加载说明文案失败', description: '' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handleSave = async () => {
    setSaving(true)
    try {
      await canbusSettingsService.updatePageIntro({ en, zh: '' })
      showToast({ type: 'success', title: '页面说明已保存', description: '' })
    } catch {
      showToast({ type: 'error', title: '保存失败', description: '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-white dark:bg-gray-800/50 border-slate-200 dark:border-gray-700">
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-800 dark:text-white">页面顶部说明</label>
          {loading ? (
            <div className="flex h-10 items-center">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            </div>
          ) : (
            <input
              value={en}
              onChange={(event) => setEn(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Front-page CANBus intro. Leave empty to use the default text."
            />
          )}
        </div>
        <Button onClick={handleSave} disabled={saving || loading} className="h-10 bg-orange-500 hover:bg-orange-600">
          {saving ? '保存中...' : '保存'}
        </Button>
      </CardContent>
    </Card>
  )
}

export const CANBusSettingsManagement: React.FC<CANBusSettingsManagementProps> = ({ dataLanguage }) => {
  const [activeTab, setActiveTab] = useState<TabType>('canbox-types')

  return (
    <div className="space-y-6">
      <PageIntroEditor />
      {/* Tab 切换 */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-gray-700 pb-4">
        <Button
          variant={activeTab === 'canbox-types' ? 'primary' : 'outline'}
          onClick={() => setActiveTab('canbox-types')}
          className={activeTab === 'canbox-types' ? 'bg-orange-500 hover:bg-orange-600' : ''}
        >
          CANBox 类型
        </Button>
        <Button
          variant={activeTab === 'settings' ? 'primary' : 'outline'}
          onClick={() => setActiveTab('settings')}
          className={activeTab === 'settings' ? 'bg-orange-500 hover:bg-orange-600' : ''}
        >
          设置图片
        </Button>
        <Button
          variant={activeTab === 'head-unit-types' ? 'primary' : 'outline'}
          onClick={() => setActiveTab('head-unit-types')}
          className={activeTab === 'head-unit-types' ? 'bg-orange-500 hover:bg-orange-600' : ''}
        >
          主机型号
        </Button>
      </div>

      {activeTab === 'canbox-types' ? (
        <CANBoxTypeManager />
      ) : activeTab === 'head-unit-types' ? (
        <HeadUnitTypeManager />
      ) : (
        <SettingsManager dataLanguage={dataLanguage} />
      )}
    </div>
  )
}

// ==================== CANBox 类型管理 ====================

const CANBoxTypeManager: React.FC = () => {
  const { showToast } = useToast()
  const [types, setTypes] = useState<CANBoxType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<CANBoxTypeInput>({ name: '', image: '' })
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string }>({ show: false, id: '' })

  const loadTypes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await canbusSettingsService.getAllCANBoxTypes()
      setTypes(data)
    } catch {
      showToast({ type: 'error', title: '加载失败', description: '' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadTypes()
  }, [loadTypes])

  const handleAdd = () => {
    setFormData({ name: '', image: '', sortOrder: types.length, isActive: true })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (type: CANBoxType) => {
    setFormData({ name: type.name, image: type.image, sortOrder: type.sortOrder, isActive: type.isActive })
    setEditingId(type._id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.image) {
      showToast({ type: 'warning', title: '请填写名称和图片', description: '' })
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await canbusSettingsService.updateCANBoxType(editingId, formData)
        showToast({ type: 'success', title: '更新成功', description: '' })
      } else {
        await canbusSettingsService.createCANBoxType(formData)
        showToast({ type: 'success', title: '创建成功', description: '' })
      }
      setShowForm(false)
      loadTypes()
    } catch {
      showToast({ type: 'error', title: '保存失败', description: '' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await canbusSettingsService.deleteCANBoxType(id)
      showToast({ type: 'success', title: '删除成功', description: '' })
      loadTypes()
    } catch {
      showToast({ type: 'error', title: '删除失败', description: '' })
    } finally {
      setDeleteConfirm({ show: false, id: '' })
    }
  }

  return (
    <>
      <Card className="bg-white dark:bg-gray-800/50 border-slate-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800 dark:text-white">
              CANBox 类型管理
            </CardTitle>
            <Button onClick={handleAdd} className="bg-orange-500 hover:bg-orange-600">
              新增类型
            </Button>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-2">
            管理 CANBox 产品外观图片，用于前台用户识别自己的设备型号
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : types.length === 0 ? (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">暂无 CANBox 类型</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {types.map((type) => (
                <div
                  key={type._id}
                  className={`relative p-4 rounded-xl border-2 ${
                    type.isActive
                      ? 'border-slate-200 dark:border-gray-600'
                      : 'border-red-200 dark:border-red-800 opacity-60'
                  }`}
                >
                  {type.image ? (
                    <img src={type.image} alt={type.name} className="w-full aspect-square object-contain rounded-lg" />
                  ) : (
                    <div className="w-full aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                      <Settings className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <p className="mt-2 text-sm font-medium text-center text-slate-700 dark:text-gray-300 truncate">
                    {type.name}
                  </p>
                  {!type.isActive && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded">
                      已禁用
                    </span>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={() => handleEdit(type)}
                      className="p-1 bg-white dark:bg-gray-700 rounded shadow hover:bg-slate-100 dark:hover:bg-gray-600"
                    >
                      <Edit2 className="h-3 w-3 text-slate-600 dark:text-gray-300" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ show: true, id: type._id })}
                      className="p-1 bg-white dark:bg-gray-700 rounded shadow hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-white dark:bg-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editingId ? '编辑 CANBox 类型' : '新增 CANBox 类型'}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">名称 *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: RZC, Raise, Hiworld"
                  className="bg-slate-50 dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">产品图片 *</label>
                <div className="flex items-center gap-4">
                  {formData.image ? (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                      <img src={formData.image} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setFormData({ ...formData, image: '' })}
                        className="absolute top-1 right-1 p-0.5 bg-red-500 rounded-full text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-slate-400" />
                    </div>
                  )}
                  <Button variant="outline" onClick={() => setShowImagePicker(true)}>
                    选择图片
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive ?? true}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isActive" className="text-sm text-slate-600 dark:text-gray-300">启用</label>
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">取消</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showImagePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">选择图片</h3>
              <button
                onClick={() => setShowImagePicker(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <ImagePicker
                value={formData.image}
                onChange={(url: string) => {
                  setFormData({ ...formData, image: url })
                  setShowImagePicker(false)
                }}
                showUpload={true}
                uploadFolder="uploads"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.show}
        onClose={() => setDeleteConfirm({ show: false, id: '' })}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        title="删除确认"
        message="确定要删除这个 CANBox 类型吗？"
        confirmText="删除"
        cancelText="取消"
        type="danger"
      />
    </>
  )
}

// ==================== 主机型号管理 ====================

const HeadUnitTypeManager: React.FC = () => {
  const { showToast } = useToast()
  const [types, setTypes] = useState<HeadUnitType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<HeadUnitTypeInput>({ name: '', image: '', description: '', sortOrder: 0, isActive: true })
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string }>({ show: false, id: '' })

  const loadTypes = useCallback(async () => {
    setLoading(true)
    try {
      setTypes(await canbusSettingsService.getAllHeadUnitTypes())
    } catch {
      showToast({ type: 'error', title: '加载主机型号失败', description: '' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadTypes() }, [loadTypes])

  const handleAdd = () => {
    setEditingId(null)
    setFormData({ name: '', image: '', description: '', sortOrder: 0, isActive: true })
    setShowForm(true)
  }

  const handleEdit = (item: HeadUnitType) => {
    setEditingId(item._id)
    setFormData({
      name: item.name,
      image: item.image || '',
      description: item.description || '',
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast({ type: 'warning', title: '请输入主机型号名称', description: '' })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await canbusSettingsService.updateHeadUnitType(editingId, formData)
      } else {
        await canbusSettingsService.createHeadUnitType(formData)
      }
      showToast({ type: 'success', title: editingId ? '更新成功' : '创建成功', description: '' })
      setShowForm(false)
      await loadTypes()
    } catch {
      showToast({ type: 'error', title: '保存主机型号失败', description: '' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await canbusSettingsService.deleteHeadUnitType(id)
      showToast({ type: 'success', title: '删除成功', description: '' })
      await loadTypes()
    } catch {
      showToast({ type: 'error', title: '删除失败，请先移除关联的 CANBus 设置', description: '' })
    } finally {
      setDeleteConfirm({ show: false, id: '' })
    }
  }

  return (
    <>
      <Card className="bg-white dark:bg-gray-800/50 border-slate-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-slate-800 dark:text-white">主机型号管理</CardTitle>
              <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">维护产品安卓主机的品牌或系列型号，可关联 CANBus 设置和主机操作教程。</p>
            </div>
            <Button onClick={handleAdd} className="bg-orange-500 hover:bg-orange-600">新增主机型号</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>
          ) : types.length === 0 ? (
            <div className="py-12 text-center text-slate-500 dark:text-gray-400">暂无主机型号，请先新增。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">名称</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">图片</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">说明</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">状态</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-600 dark:text-gray-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {types.map(item => (
                    <tr key={item._id}>
                      <td className="px-4 py-3 text-sm text-slate-800 dark:text-gray-100">{item.name}</td>
                      <td className="px-4 py-3">{item.image ? <img src={item.image} alt="" className="h-12 w-20 rounded object-cover bg-slate-100 dark:bg-gray-700" /> : <span className="text-sm text-slate-400">未设置</span>}</td>
                      <td className="max-w-md px-4 py-3 text-sm text-slate-600 dark:text-gray-300">{item.description || '—'}</td>
                      <td className="px-4 py-3 text-sm">{item.isActive ? <span className="text-green-600 dark:text-green-400">启用</span> : <span className="text-slate-400">停用</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} className="mr-1"><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ show: true, id: item._id })} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg bg-white dark:bg-gray-800">
            <CardHeader><div className="flex items-center justify-between"><CardTitle>{editingId ? '编辑主机型号' : '新增主机型号'}</CardTitle><Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-5 w-5" /></Button></div></CardHeader>
            <CardContent className="space-y-4">
              <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-300">名称 *</label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="例如：Brand A、Series X" className="bg-slate-50 dark:bg-gray-700" /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-300">产品图片</label><div className="flex items-center gap-4">{formData.image ? <div className="relative h-20 w-20 overflow-hidden rounded-lg border"><img src={formData.image} alt="" className="h-full w-full object-cover" /><button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="absolute right-1 top-1 rounded bg-red-500 px-1 text-xs text-white">移除</button></div> : <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300"><ImageIcon className="h-6 w-6 text-slate-400" /></div>}<Button variant="outline" onClick={() => setShowImagePicker(true)}>选择图片</Button></div></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-300">型号说明</label><textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={4} placeholder="可填写屏幕尺寸、产品系列、适用范围等说明" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" /></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-gray-300">排序</label><Input type="number" value={formData.sortOrder ?? 0} onChange={e => setFormData({ ...formData, sortOrder: Number(e.target.value) || 0 })} className="bg-slate-50 dark:bg-gray-700" /></div><label className="flex items-center gap-2 pt-7 text-sm text-slate-600 dark:text-gray-300"><input type="checkbox" checked={formData.isActive ?? true} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />启用</label></div>
              <div className="flex gap-3 pt-2"><Button onClick={handleSave} disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600">{saving ? '保存中...' : '保存'}</Button><Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">取消</Button></div>
            </CardContent>
          </Card>
        </div>
      )}

      {showImagePicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-gray-700"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">选择图片</h3><Button variant="ghost" size="sm" onClick={() => setShowImagePicker(false)}><X className="h-5 w-5" /></Button></div>
            <div className="p-6"><ImagePicker value={formData.image} onChange={url => { setFormData({ ...formData, image: url }); setShowImagePicker(false) }} showUpload uploadFolder="uploads" /></div>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={deleteConfirm.show} onClose={() => setDeleteConfirm({ show: false, id: '' })} onConfirm={() => handleDelete(deleteConfirm.id)} title="删除确认" message="确定要删除这个主机型号吗？" confirmText="删除" cancelText="取消" type="danger" />
    </>
  )
}

// ==================== 设置图片管理 ====================

const SettingsManager: React.FC<{ dataLanguage: DataLanguage }> = ({ dataLanguage }) => {
  const { showToast } = useToast()
  const [settings, setSettings] = useState<CANBusSetting[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [headUnitTypes, setHeadUnitTypes] = useState<HeadUnitType[]>([])
  const [formData, setFormData] = useState<CANBusSettingInput>({ vehicleId: '', headUnitTypeId: '', settingImage: '', settingImages: [], description: '' })
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string }>({ show: false, id: '' })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsData, vehiclesData, headUnitTypesData] = await Promise.all([
        canbusSettingsService.getAllSettings(),
        getVehicles(dataLanguage),
        canbusSettingsService.getAllHeadUnitTypes()
      ])
      setSettings(settingsData)
      setVehicles(vehiclesData.filter(v => v._id !== undefined))
      setHeadUnitTypes(headUnitTypesData)
    } catch {
      showToast({ type: 'error', title: '加载失败', description: '' })
    } finally {
      setLoading(false)
    }
  }, [showToast, dataLanguage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setFormData({ vehicleId: '', headUnitTypeId: '', settingImage: '', settingImages: [], description: '', isActive: true })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (setting: CANBusSetting) => {
    const settingImage = setting.settingImage || setting.settingImages?.[0] || ''
    setFormData({
      vehicleId: setting.vehicleId._id,
      headUnitTypeId: typeof setting.headUnitTypeId === 'string' ? setting.headUnitTypeId : setting.headUnitTypeId?._id || '',
      settingImage,
      settingImages: settingImage ? [settingImage] : [],
      description: setting.description || '',
      isActive: setting.isActive
    })
    setEditingId(setting._id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.vehicleId || !formData.headUnitTypeId || !formData.settingImage) {
      showToast({ type: 'warning', title: '请选择车型、主机型号并添加设置图片', description: '' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...formData,
        settingImage: formData.settingImage,
        settingImages: [formData.settingImage],
      }
      if (editingId) {
        await canbusSettingsService.updateSetting(editingId, payload)
        showToast({ type: 'success', title: '更新成功', description: '' })
      } else {
        await canbusSettingsService.createSetting(payload)
        showToast({ type: 'success', title: '创建成功', description: '' })
      }
      setShowForm(false)
      loadData()
    } catch {
      showToast({ type: 'error', title: '保存失败，该车型与主机型号可能已有设置', description: '' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await canbusSettingsService.deleteSetting(id)
      showToast({ type: 'success', title: '删除成功', description: '' })
      loadData()
    } catch {
      showToast({ type: 'error', title: '删除失败', description: '' })
    } finally {
      setDeleteConfirm({ show: false, id: '' })
    }
  }

  return (
    <>
      <Card className="bg-white dark:bg-gray-800/50 border-slate-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-slate-800 dark:text-white">
              设置图片管理
            </CardTitle>
            <Button onClick={handleAdd} className="bg-orange-500 hover:bg-orange-600">
              新增设置
            </Button>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-2">
            为每个车型配置 CANBus 设置图片和说明
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          ) : settings.length === 0 ? (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">暂无设置数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">车型</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">主机型号</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">设置图片</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">描述</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-gray-300">状态</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-600 dark:text-gray-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {settings.map((setting) => (
                    <tr key={setting._id} className="hover:bg-slate-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-gray-300">
                        {setting.vehicleId?.brand} {setting.vehicleId?.model || setting.vehicleId?.modelName} ({setting.vehicleId?.year})
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-gray-300">
                        {typeof setting.headUnitTypeId === 'string' ? setting.headUnitTypeId : setting.headUnitTypeId?.name || '旧数据'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {(setting.settingImage || setting.settingImages?.[0]) && (
                            <img src={setting.settingImage || setting.settingImages?.[0]} alt="" className="h-10 w-16 rounded object-cover" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 max-w-xs truncate">
                        {setting.description || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          setting.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {setting.isActive ? '启用' : '禁用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(setting)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ show: true, id: setting._id })} className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg bg-white dark:bg-gray-800 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editingId ? '编辑设置' : '新增设置'}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">车型 *</label>
                <select
                  value={formData.vehicleId}
                  onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white [&>option]:bg-white [&>option]:dark:bg-gray-700 [&>option]:text-slate-800 [&>option]:dark:text-white"
                >
                  <option value="">选择车型</option>
                  {vehicles.map(v => (
                    <option key={v._id} value={v._id}>
                      {v.brand} {v.model} ({v.year})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">主机型号 *</label>
                <select
                  value={formData.headUnitTypeId || ''}
                  onChange={(e) => setFormData({ ...formData, headUnitTypeId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">选择主机型号</option>
                  {headUnitTypes.filter(item => item.isActive || item._id === formData.headUnitTypeId).map(item => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">设置图片 *</label>
                <div className="space-y-2">
                  {formData.settingImage ? (
                    <div className="relative overflow-hidden rounded-lg border">
                      <img src={formData.settingImage} alt="" className="h-40 w-full object-contain bg-slate-100 dark:bg-gray-700" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, settingImage: '', settingImages: [] })}
                        className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-24 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-slate-400" />
                    </div>
                  )}
                  <Button variant="outline" onClick={() => setShowImagePicker(true)} className="w-full">
                    {formData.settingImage ? '更换设置图片' : '选择设置图片'}
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">描述说明</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="告诉用户为什么选择这个选项，或其他注意事项..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="settingIsActive"
                  checked={formData.isActive ?? true}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="settingIsActive" className="text-sm text-slate-600 dark:text-gray-300">启用</label>
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">取消</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showImagePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">选择图片</h3>
              <button
                onClick={() => setShowImagePicker(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <ImagePicker
                value={formData.settingImage}
                onChange={(url: string) => {
                  setFormData({ ...formData, settingImage: url, settingImages: url ? [url] : [] })
                  setShowImagePicker(false)
                }}
                showUpload={true}
                uploadFolder="uploads"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.show}
        onClose={() => setDeleteConfirm({ show: false, id: '' })}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        title="删除确认"
        message="确定要删除这条设置吗？"
        confirmText="删除"
        cancelText="取消"
        type="danger"
      />
    </>
  )
}

export default CANBusSettingsManagement
