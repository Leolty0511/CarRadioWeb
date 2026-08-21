import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Monitor, Search, Smartphone, Tablet, UserCheck, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { getMembers, setMemberStatus, type MemberRecord } from '@/services/memberAdminService'

const DEVICE_LABELS: Record<MemberRecord['lastSeenDeviceType'], string> = { desktop: '电脑', mobile: '手机', tablet: '平板', unknown: '未知设备' }
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '暂无记录'

function DeviceIcon({ type }: { type: MemberRecord['lastSeenDeviceType'] }) {
  if (type === 'mobile') {return <Smartphone className="h-4 w-4" />}
  if (type === 'tablet') {return <Tablet className="h-4 w-4" />}
  return <Monitor className="h-4 w-4" />
}

export function MemberManagement() {
  const { showToast } = useToast()
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, online: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = async (requestedPage = page) => {
    setLoading(true)
    try {
      const result = await getMembers({ page: requestedPage, limit: 20, search: search.trim() || undefined, status: statusFilter || undefined })
      if (result.success && result.data) {
        setMembers(result.data.items || [])
        setPage(result.data.page || requestedPage)
        setTotal(result.data.total || 0)
        setTotalPages(Math.max(1, result.data.totalPages || 1))
        if (result.data.stats) {setStats(result.data.stats)}
      }
    } catch {
      showToast({ type: 'error', title: '会员数据加载失败' })
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250)
    return () => window.clearTimeout(timer)
  }, [search, statusFilter])

  const updateStatus = async (member: MemberRecord, status: 'active' | 'suspended') => {
    const result = await setMemberStatus(member._id, status)
    if (result.success) {
      showToast({ type: 'success', title: status === 'active' ? '会员账号已恢复' : '会员账号已停用' })
      await load(page)
    } else {showToast({ type: 'error', title: '会员状态更新失败' })}
  }

  if (loading && members.length === 0) {return <div className="p-6 text-slate-500">加载中...</div>}

  return <div className="mx-auto w-full max-w-[1480px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-cyan-600">ACCOUNT OPERATIONS</p><h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">会员管理</h2></div><p className="text-sm text-slate-500">在线状态按最近 5 分钟活动统计</p></div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><Metric title="会员总数" value={stats.total} icon={<Users className="h-5 w-5" />} tone="blue" /><Metric title="当前在线" value={stats.online} icon={<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />} tone="green" /><Metric title="正常账号" value={stats.active} icon={<UserCheck className="h-5 w-5" />} tone="indigo" /></div>
    <Card><CardHeader className="gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-lg">会员账号 <span className="text-sm font-normal text-slate-500">{total}</span></CardTitle><div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索邮箱、昵称或 IP" /></div><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">全部状态</option><option value="active">正常</option><option value="suspended">已停用</option></select></div></div></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700"><th className="p-3">会员</th><th className="p-3">状态</th><th className="p-3">最近活动</th><th className="p-3">设备</th><th className="p-3">地区 / IP</th><th className="p-3">注册时间</th><th className="p-3">操作</th></tr></thead><tbody>{members.map(member => <tr key={member._id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{member.nickname}</div><div className="mt-0.5 text-xs text-slate-500">{member.email}</div></td><td className="p-3"><div className="flex items-center gap-2"><Badge size="sm" variant={member.status === 'active' ? 'success' : 'error'}>{member.status === 'active' ? '正常' : '已停用'}</Badge>{member.isOnline && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />在线</span>}</div></td><td className="p-3 text-xs text-slate-600 dark:text-slate-300">{formatDate(member.lastActivityAt)}</td><td className="p-3"><div className="flex items-center gap-2"><DeviceIcon type={member.lastSeenDeviceType} /><span>{DEVICE_LABELS[member.lastSeenDeviceType]}</span></div><div className="mt-1 text-xs text-slate-500">{member.lastSeenOs || '未知'} · {member.lastSeenBrowser || '未知'}</div></td><td className="p-3"><div className="text-xs">{[member.registrationCountry, member.registrationRegion, member.registrationCity].filter(Boolean).join(' / ') || '未知'}</div><div className="mt-1 text-xs text-slate-500">{member.lastSeenIp || member.registrationIp || '未知 IP'}</div></td><td className="p-3 text-xs text-slate-500">{formatDate(member.createdAt)}</td><td className="p-3"><button type="button" onClick={() => void updateStatus(member, member.status === 'active' ? 'suspended' : 'active')} className={member.status === 'active' ? 'rounded-md p-1.5 text-red-600 hover:bg-red-50' : 'rounded-md p-1.5 text-blue-600 hover:bg-blue-50'} title={member.status === 'active' ? '停用账号' : '恢复账号'}><UserCheck className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
      {members.length === 0 && <div className="py-12 text-center text-sm text-slate-500">没有匹配的会员</div>}
      {totalPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-slate-700"><span className="text-slate-500">第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void load(page - 1)} disabled={page <= 1}><ChevronLeft className="mr-1 h-4 w-4" />上一页</Button><Button size="sm" variant="outline" onClick={() => void load(page + 1)} disabled={page >= totalPages}>下一页<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
    </CardContent></Card>
  </div>
}

function Metric({ title, value, icon, tone }: { title: string; value: number; icon: ReactNode; tone: 'blue' | 'green' | 'indigo' }) {
  const colors = { blue: 'border-blue-200 bg-blue-50 text-blue-600', green: 'border-emerald-200 bg-emerald-50 text-emerald-600', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-600' }
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}><div className="flex items-center justify-between"><span className="text-sm font-medium">{title}</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">{icon}</span></div><p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p></div>
}

export default MemberManagement
