import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, Monitor, Search, Smartphone, Tablet, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import {
  createMemberInvitation,
  getMemberAdminSettings,
  getMemberInvitations,
  getMembers,
  saveMemberAdminSettings,
  setMemberStatus,
  toggleMemberInvitation,
  type MemberRecord,
} from '@/services/memberAdminService'

const STATUS_LABELS: Record<MemberRecord['status'], string> = {
  pending: '待审批',
  active: '正常',
  suspended: '已停用',
  rejected: '已拒绝',
}

const DEVICE_LABELS: Record<MemberRecord['lastSeenDeviceType'], string> = {
  desktop: '电脑',
  mobile: '手机',
  tablet: '平板',
  unknown: '未知设备',
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '暂无记录'
}

function DeviceIcon({ type }: { type: MemberRecord['lastSeenDeviceType'] }) {
  if (type === 'mobile') {return <Smartphone className="h-4 w-4" />}
  if (type === 'tablet') {return <Tablet className="h-4 w-4" />}
  return <Monitor className="h-4 w-4" />
}

function statusVariant(status: MemberRecord['status']) {
  if (status === 'active') {return 'success' as const}
  if (status === 'pending') {return 'warning' as const}
  if (status === 'suspended') {return 'error' as const}
  return 'secondary' as const
}

export function MemberManagement() {
  const { showToast } = useToast()
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, online: 0 })
  const [settings, setSettings] = useState({ registrationEnabled: true, approvalRequired: false, invitationRequired: false })
  const [invitations, setInvitations] = useState<any[]>([])
  const [maxUses, setMaxUses] = useState('1')
  const [note, setNote] = useState('')
  const [newCode, setNewCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = async (requestedPage = page) => {
    setLoading(true)
    try {
      const [memberRes, settingsRes, invitationRes] = await Promise.all([
        getMembers({ page: requestedPage, limit: 20, search: search.trim() || undefined, status: statusFilter || undefined }),
        getMemberAdminSettings(),
        getMemberInvitations(),
      ])
      if (memberRes.success && memberRes.data) {
        setMembers(memberRes.data.items || [])
        setPage(memberRes.data.page || requestedPage)
        setTotal(memberRes.data.total || 0)
        setTotalPages(Math.max(1, memberRes.data.totalPages || 1))
        if (memberRes.data.stats) {setStats(memberRes.data.stats)}
      }
      if (settingsRes.success && settingsRes.data) {
        setSettings({
          registrationEnabled: settingsRes.data.registrationEnabled,
          approvalRequired: settingsRes.data.approvalRequired,
          invitationRequired: settingsRes.data.invitationRequired,
        })
      }
      if (invitationRes.success) {setInvitations(invitationRes.data || [])}
    } catch {
      showToast({ type: 'error', title: '会员数据加载失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250)
    return () => window.clearTimeout(timer)
  }, [search, statusFilter])

  const saveSettings = async () => {
    const result = await saveMemberAdminSettings(settings)
    showToast({ type: result.success ? 'success' : 'error', title: result.success ? '会员注册规则已保存' : '保存失败' })
  }

  const review = async (member: MemberRecord, status: 'active' | 'rejected' | 'suspended') => {
    const result = await setMemberStatus(member._id, status)
    if (result.success) {
      showToast({ type: 'success', title: `已将 ${member.nickname} 设置为${STATUS_LABELS[status]}` })
      await load(page)
    } else {showToast({ type: 'error', title: '会员状态更新失败' })}
  }

  const createInvite = async () => {
    const result = await createMemberInvitation({ maxUses: Number(maxUses) || 1, note })
    if (result.success) {
      setNewCode(result.code)
      setNote('')
      await load(page)
    } else {showToast({ type: 'error', title: '邀请码创建失败' })}
  }

  if (loading && members.length === 0) {return <div className="p-6 text-slate-500">加载中...</div>}

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-cyan-600">ACCOUNT OPERATIONS</p><h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">会员管理</h2></div>
        <p className="text-sm text-slate-500">在线状态按最近 5 分钟活动统计</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Metric title="会员总数" value={stats.total} icon={<Users className="h-5 w-5" />} tone="blue" />
        <Metric title="当前在线" value={stats.online} icon={<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />} tone="green" />
        <Metric title="正常账号" value={stats.active} icon={<UserCheck className="h-5 w-5" />} tone="indigo" />
        <Metric title="待审批" value={stats.pending} icon={<span className="text-lg leading-none">!</span>} tone="amber" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card><CardHeader><CardTitle className="text-lg">注册规则</CardTitle></CardHeader><CardContent className="space-y-4">
          <ToggleRow label="开放会员注册" checked={settings.registrationEnabled} onChange={(v) => setSettings({ ...settings, registrationEnabled: v })} />
          <ToggleRow label="注册后需要审批" checked={settings.approvalRequired} onChange={(v) => setSettings({ ...settings, approvalRequired: v })} />
          <ToggleRow label="注册需要邀请码" checked={settings.invitationRequired} onChange={(v) => setSettings({ ...settings, invitationRequired: v })} />
          <Button size="sm" onClick={saveSettings}>保存规则</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">邀请码</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2"><Input className="w-28" type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="使用次数" /><Input className="min-w-[180px] flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" /><Button size="sm" onClick={createInvite}><UserPlus className="mr-1.5 h-4 w-4" />生成</Button></div>
          {newCode && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200"><code className="font-mono font-semibold">{newCode}</code><button type="button" title="复制邀请码" onClick={() => navigator.clipboard.writeText(newCode)}><Copy className="h-4 w-4" /></button></div>}
          <div className="max-h-48 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-700">{invitations.map((item) => <div key={item._id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="truncate text-slate-600 dark:text-slate-300">{item.prefix} · {item.usedCount}/{item.maxUses}{item.note ? ` · ${item.note}` : ''}</span><button type="button" onClick={async () => { await toggleMemberInvitation(item._id, !item.enabled); await load(page) }} className={item.enabled ? 'text-emerald-600' : 'text-slate-400'}>{item.enabled ? '启用' : '停用'}</button></div>)}</div>
        </CardContent></Card>
      </div>

      <Card><CardHeader className="gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-lg">会员账号 <span className="text-sm font-normal text-slate-500">{total}</span></CardTitle><div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索邮箱、昵称或 IP" /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="">全部状态</option><option value="pending">待审批</option><option value="active">正常</option><option value="suspended">已停用</option><option value="rejected">已拒绝</option></select></div></div></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700"><th className="p-3">会员</th><th className="p-3">状态</th><th className="p-3">最近活动</th><th className="p-3">设备</th><th className="p-3">地区 / IP</th><th className="p-3">注册时间</th><th className="p-3">操作</th></tr></thead><tbody>{members.map((member) => <tr key={member._id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{member.nickname}</div><div className="mt-0.5 text-xs text-slate-500">{member.email}</div></td><td className="p-3"><div className="flex items-center gap-2"><Badge size="sm" variant={statusVariant(member.status)}>{STATUS_LABELS[member.status]}</Badge>{member.isOnline && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />在线</span>}</div></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{formatDate(member.lastActivityAt)}</td><td className="p-3"><div className="flex items-center gap-2 text-slate-700 dark:text-slate-200"><DeviceIcon type={member.lastSeenDeviceType} /><span>{DEVICE_LABELS[member.lastSeenDeviceType]}</span></div><div className="mt-1 text-xs text-slate-500">{member.lastSeenOs || '未知'} · {member.lastSeenBrowser || '未知'}</div></td><td className="p-3"><div className="text-xs text-slate-600 dark:text-slate-300">{[member.registrationCountry, member.registrationRegion, member.registrationCity].filter(Boolean).join(' / ') || '未知'}</div><div className="mt-1 text-xs text-slate-500">{member.lastSeenIp || member.registrationIp || '未知 IP'}</div></td><td className="p-3 text-xs text-slate-500">{formatDate(member.createdAt)}</td><td className="p-3"><div className="flex gap-1">{member.status === 'pending' && <><button type="button" title="通过" onClick={() => void review(member, 'active')} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button><button type="button" title="拒绝" onClick={() => void review(member, 'rejected')} className="rounded-md p-1.5 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button></>}{member.status === 'active' && <button type="button" title="停用" onClick={() => void review(member, 'suspended')} className="rounded-md p-1.5 text-red-600 hover:bg-red-50"><UserCheck className="h-4 w-4" /></button>}{member.status === 'suspended' && <button type="button" title="恢复" onClick={() => void review(member, 'active')} className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50"><UserCheck className="h-4 w-4" /></button>}</div></td></tr>)}</tbody></table></div>
        {members.length === 0 && <div className="py-12 text-center text-sm text-slate-500">没有匹配的会员</div>}
        {totalPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-slate-700"><span className="text-slate-500">第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void load(page - 1)} disabled={page <= 1}><ChevronLeft className="mr-1 h-4 w-4" />上一页</Button><Button size="sm" variant="outline" onClick={() => void load(page + 1)} disabled={page >= totalPages}>下一页<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
      </CardContent></Card>
    </div>
  )
}

function Metric({ title, value, icon, tone }: { title: string; value: number; icon: ReactNode; tone: 'blue' | 'green' | 'indigo' | 'amber' }) {
  const colors = { blue: 'border-blue-200 bg-blue-50 text-blue-600', green: 'border-emerald-200 bg-emerald-50 text-emerald-600', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-600', amber: 'border-amber-200 bg-amber-50 text-amber-600' }
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}><div className="flex items-center justify-between"><span className="text-sm font-medium">{title}</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">{icon}</span></div><p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p></div>
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200"><span>{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'left-6' : 'left-1'}`} /></button></label>
}

export default MemberManagement
