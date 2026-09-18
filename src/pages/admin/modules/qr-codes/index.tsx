import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  Pencil,
  PlayCircle,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { userHasPermission, type AdminUser } from '@/services/authService'
import {
  createQrLinkHub,
  deleteQrLinkHub,
  getQrLinkHubs,
  updateQrLinkHub,
  type QrLinkHub,
  type QrLinkHubInput,
  type QrLinkItem,
  type QrLinkType,
} from '@/services/qrLinkHubService'

const INPUT_CLASS = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
const TEXTAREA_CLASS = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

const LINK_TYPE_OPTIONS: Array<{ value: QrLinkType; label: string; icon: typeof Link2 }> = [
  { value: 'video', label: '视频', icon: PlayCircle },
  { value: 'pdf', label: 'PDF 说明书', icon: FileText },
  { value: 'website', label: '网站', icon: Globe2 },
  { value: 'page', label: '网站子页面', icon: ExternalLink },
  { value: 'download', label: '下载', icon: Download },
  { value: 'other', label: '其他链接', icon: Link2 },
]

type LinkDraft = Omit<QrLinkItem, '_id' | 'id'>
type FormState = QrLinkHubInput

const EMPTY_LINK: LinkDraft = {
  label: '',
  description: '',
  url: '',
  type: 'website',
  enabled: true,
  order: 0,
}

const EMPTY_FORM: FormState = {
  name: '',
  title: '',
  description: '',
  enabled: true,
  links: [],
}

function publicUrl(token: string): string {
  const siteOrigin = import.meta.env.VITE_SITE_URL || window.location.origin
  return new URL(`/r/${token}`, siteOrigin).toString()
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-')
  return normalized.slice(0, 80) || 'qr-code'
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
}

async function downloadQrPng(hub: QrLinkHub) {
  const dataUrl = await QRCode.toDataURL(publicUrl(hub.token), {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 1024,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  const response = await fetch(dataUrl)
  downloadBlob(await response.blob(), `${safeFileName(hub.name)}.png`)
}

async function downloadQrSvg(hub: QrLinkHub) {
  const svg = await QRCode.toString(publicUrl(hub.token), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeFileName(hub.name)}.svg`)
}

function QrPreview({ hub }: { hub: QrLinkHub }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(publicUrl(hub.token), {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 420,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((value) => {
      if (active) {setSrc(value)}
    })
    return () => { active = false }
  }, [hub.token])

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-white">{hub.title}</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hub.description || '未设置说明'}</p>
        <div className="mt-5 space-y-2">
          {hub.links.filter((item) => item.enabled).sort((a, b) => a.order - b.order).map((item) => (
            <div key={item._id || item.label} className="flex items-center gap-3 border border-slate-200 px-3 py-2 dark:border-slate-700">
              <Link2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300 break-all">
          {publicUrl(hub.token)}
        </div>
      </div>
      <div className="flex flex-col items-center border-l-0 border-slate-200 md:border-l md:pl-6 dark:border-slate-700">
        <div className="aspect-square w-full max-w-64 bg-white p-2">
          {src ? <img src={src} alt={`${hub.name} QR code`} className="h-full w-full" /> : <div className="h-full w-full animate-pulse bg-slate-100" />}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">扫码地址固定，修改链接后无需重新印刷</p>
      </div>
    </div>
  )
}

interface EditorProps {
  initial?: QrLinkHub
  saving: boolean
  onSave: (value: FormState) => Promise<void>
  onClose: () => void
}

function QrHubEditor({ initial, saving, onSave, onClose }: EditorProps) {
  const [form, setForm] = useState<FormState>(() => initial ? {
    name: initial.name,
    title: initial.title,
    description: initial.description,
    enabled: initial.enabled,
    links: [...initial.links]
      .sort((a, b) => a.order - b.order)
      .map(({ label, description, url, type, enabled }, order) => ({ label, description, url, type, enabled, order })),
  } : EMPTY_FORM)
  const [error, setError] = useState('')

  const updateLink = (index: number, patch: Partial<LinkDraft>) => {
    setForm((current) => ({
      ...current,
      links: current.links.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }))
  }

  const moveLink = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= form.links.length) {return}
    setForm((current) => {
      const links = [...current.links]
      ;[links[index], links[target]] = [links[target], links[index]]
      return { ...current, links: links.map((item, order) => ({ ...item, order })) }
    })
  }

  const submit = async () => {
    setError('')
    if (!form.name.trim() || !form.title.trim()) {
      setError('请填写后台名称和扫码页标题')
      return
    }
    if (form.links.some((item) => !item.label.trim() || !item.url.trim())) {
      setError('每条链接都必须填写显示名称和目标 URL')
      return
    }
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        links: form.links.map((item, order) => ({
          ...item,
          label: item.label.trim(),
          description: item.description.trim(),
          url: item.url.trim(),
          order,
        })),
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={initial ? '编辑二维码项目' : '创建二维码项目'} size="xl" closeOnOverlayClick={!saving}>
      <div className="space-y-6">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300" role="alert">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <span>后台名称</span>
            <input className={INPUT_CLASS} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} placeholder="例如：Ford Focus 安装资料" />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <span>扫码页标题</span>
            <input className={INPUT_CLASS} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} placeholder="例如：Choose a resource" />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm text-slate-700 dark:text-slate-200">
          <span>扫码页说明（可选）</span>
          <textarea className={TEXTAREA_CLASS} rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={500} placeholder="例如：Installation guides and support" />
          <p className="text-xs text-slate-500">扫码页面向美国用户，请用英文填写标题、说明及下方链接名称。</p>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
          启用扫码页
        </label>

        <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">链接选项</h3>
              <p className="mt-1 text-xs text-slate-500">用户只会看到显示名称和说明，不显示 URL 文本。最多 20 条。</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={form.links.length >= 20} onClick={() => setForm({ ...form, links: [...form.links, { ...EMPTY_LINK, order: form.links.length }] })}>
              <Plus className="mr-1 h-4 w-4" />添加链接
            </Button>
          </div>

          <div className="space-y-3">
            {form.links.map((item, index) => (
              <div key={index} className="border border-slate-200 p-3 dark:border-slate-700">
                <div className="grid gap-3 lg:grid-cols-[9rem_minmax(10rem,0.8fr)_minmax(16rem,1.4fr)_auto]">
                  <label className="grid gap-1 text-xs text-slate-500">
                    <span>类型</span>
                    <select className={INPUT_CLASS} value={item.type} onChange={(event) => updateLink(index, { type: event.target.value as QrLinkType })}>
                      {LINK_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500">
                    <span>显示名称</span>
                    <input className={INPUT_CLASS} value={item.label} onChange={(event) => updateLink(index, { label: event.target.value })} maxLength={100} placeholder="Installation video" />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500">
                    <span>目标 URL</span>
                    <input className={INPUT_CLASS} type="url" value={item.url} onChange={(event) => updateLink(index, { url: event.target.value })} maxLength={2000} placeholder="https://drive.google.com/..." />
                  </label>
                  <div className="flex h-10 items-center gap-1 self-end">
                    <button type="button" title="上移" aria-label="上移" disabled={index === 0} onClick={() => moveLink(index, -1)} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" title="下移" aria-label="下移" disabled={index === form.links.length - 1} onClick={() => moveLink(index, 1)} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" title="删除链接" aria-label="删除链接" onClick={() => setForm({ ...form, links: form.links.filter((_, itemIndex) => itemIndex !== index).map((entry, order) => ({ ...entry, order })) })} className="flex h-9 w-9 items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="grid gap-1 text-xs text-slate-500">
                    <span>简短说明（可选）</span>
                    <input className={INPUT_CLASS} value={item.description} onChange={(event) => updateLink(index, { description: event.target.value })} maxLength={240} placeholder="例如：Watch the installation guide on Google Drive" />
                  </label>
                  <label className="flex h-10 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={item.enabled} onChange={(event) => updateLink(index, { enabled: event.target.checked })} className="h-4 w-4" />显示此链接
                  </label>
                </div>
              </div>
            ))}
            {form.links.length === 0 && <div className="border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">尚未添加链接</div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5 dark:border-slate-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="button" onClick={submit} loading={saving}>{initial ? '保存修改' : '创建二维码'}</Button>
        </div>
      </div>
    </Modal>
  )
}

interface QrCodeManagementProps {
  user: AdminUser | null
}

export function QrCodeManagement({ user }: QrCodeManagementProps) {
  const { showToast } = useToast()
  const [items, setItems] = useState<QrLinkHub[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<QrLinkHub | 'new' | null>(null)
  const [preview, setPreview] = useState<QrLinkHub | null>(null)
  const [deleting, setDeleting] = useState<QrLinkHub | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const canCreate = userHasPermission(user, 'qr-codes:create')
  const canUpdate = userHasPermission(user, 'qr-codes:update')
  const canDelete = userHasPermission(user, 'qr-codes:delete')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await getQrLinkHubs())
    } catch (error) {
      showToast({ type: 'error', title: '二维码项目加载失败', description: error instanceof Error ? error.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  const save = async (value: FormState) => {
    setSaving(true)
    try {
      if (editor === 'new') {
        const created = await createQrLinkHub(value)
        setItems((current) => [created, ...current])
        showToast({ type: 'success', title: '二维码项目已创建' })
      } else if (editor) {
        const updated = await updateQrLinkHub(editor._id, value)
        setItems((current) => current.map((item) => item._id === updated._id ? updated : item))
        showToast({ type: 'success', title: '二维码项目已更新' })
      }
      setEditor(null)
    } finally {
      setSaving(false)
    }
  }

  const copyAddress = async (hub: QrLinkHub) => {
    try {
      await navigator.clipboard.writeText(publicUrl(hub.token))
      showToast({ type: 'success', title: '扫码地址已复制' })
    } catch {
      showToast({ type: 'error', title: '复制失败', description: '浏览器未允许访问剪贴板，请从预览窗口手动复制地址。' })
    }
  }

  const download = async (hub: QrLinkHub, format: 'png' | 'svg') => {
    try {
      if (format === 'png') {await downloadQrPng(hub)}
      else {await downloadQrSvg(hub)}
    } catch (error) {
      showToast({
        type: 'error',
        title: '二维码下载失败',
        description: error instanceof Error ? error.message : '请稍后重试',
      })
    }
  }

  const remove = async () => {
    if (!deleting) {return}
    setDeleteBusy(true)
    try {
      await deleteQrLinkHub(deleting._id)
      setItems((current) => current.filter((item) => item._id !== deleting._id))
      setDeleting(null)
      showToast({ type: 'success', title: '二维码项目及中间页已永久删除' })
    } catch (error) {
      showToast({ type: 'error', title: '删除失败', description: error instanceof Error ? error.message : undefined })
    } finally {
      setDeleteBusy(false)
    }
  }

  const enabledCount = useMemo(() => items.filter((item) => item.enabled).length, [items])

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">二维码制作</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">创建不在主站展示的多链接二维码，扫码后仅显示已命名的资源选项。</p>
        </div>
        {canCreate && <Button onClick={() => setEditor('new')}><Plus className="mr-2 h-4 w-4" />创建二维码</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:w-[26rem]">
        <div className="border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">项目总数</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{items.length}</p>
        </div>
        <div className="border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">已启用</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{enabledCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" /></div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <QrCode className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">还没有二维码项目</p>
          <p className="mt-1 text-sm text-slate-500">创建后即可添加视频、PDF、网站和站内页面。</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((hub) => (
            <Card key={hub._id} className="rounded-md shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><QrCode className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{hub.name}</h2>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${hub.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{hub.enabled ? '已启用' : '已停用'}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">{hub.title}</p>
                    <p className="mt-2 font-mono text-xs text-slate-400 break-all">/r/{hub.token}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-500">{hub.links.length} 条链接</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <Button size="sm" variant="outline" onClick={() => setPreview(hub)}><QrCode className="mr-1 h-4 w-4" />预览</Button>
                  {canUpdate && <Button size="sm" variant="ghost" onClick={() => setEditor(hub)}><Pencil className="mr-1 h-4 w-4" />编辑</Button>}
                  <Button size="sm" variant="ghost" onClick={() => void copyAddress(hub)}><Copy className="mr-1 h-4 w-4" />复制地址</Button>
                  <Button size="sm" variant="ghost" onClick={() => void download(hub, 'png')}><Download className="mr-1 h-4 w-4" />PNG</Button>
                  <Button size="sm" variant="ghost" onClick={() => void download(hub, 'svg')}><Download className="mr-1 h-4 w-4" />SVG</Button>
                  {canDelete && <button type="button" title="永久删除" aria-label={`永久删除 ${hub.name}`} onClick={() => setDeleting(hub)} className="ml-auto flex h-8 w-8 items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editor && <QrHubEditor initial={editor === 'new' ? undefined : editor} saving={saving} onSave={save} onClose={() => !saving && setEditor(null)} />}
      {preview && (
        <Modal isOpen onClose={() => setPreview(null)} title="二维码与扫码页预览" size="lg">
          <QrPreview hub={preview} />
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(preview.token), '_blank', 'noopener,noreferrer')}><ExternalLink className="mr-1 h-4 w-4" />打开扫码页</Button>
            <Button size="sm" variant="outline" onClick={() => void download(preview, 'svg')}>下载 SVG</Button>
            <Button size="sm" onClick={() => void download(preview, 'png')}>下载 PNG</Button>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => !deleteBusy && setDeleting(null)}
        onConfirm={() => void remove()}
        title="永久删除二维码项目"
        message={`删除“${deleting?.name || ''}”后，中间页和全部链接会立即删除，已经印刷或发送的二维码将永久失效。此操作无法撤销。`}
        confirmText="永久删除"
        danger
        loading={deleteBusy}
      />
    </div>
  )
}

export default QrCodeManagement
