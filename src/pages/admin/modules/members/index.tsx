import { useEffect, useState, type ReactNode } from 'react'
import { CarFront, ChevronLeft, ChevronRight, Eye, Monitor, Search, Smartphone, Tablet, UserCheck, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { MemberVehicleFilter, type MemberVehicleFilterOption, type MemberVehicleFilterValue } from '@/components/admin/MemberVehicleFilter'
import { getMembers, getMemberVehicleFilterOptions, setMemberStatus, type MemberRecord } from '@/services/memberAdminService'

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
  const [vehicleOptions, setVehicleOptions] = useState<MemberVehicleFilterOption[]>([])
  const [vehicleOptionsLoading, setVehicleOptionsLoading] = useState(true)
  const [vehicleFilter, setVehicleFilter] = useState<MemberVehicleFilterValue>({ brand: '', modelName: '', vehicleId: '' })
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null)

  const load = async (requestedPage = page) => {
    setLoading(true)
    try {
      const result = await getMembers({
        page: requestedPage,
        limit: 20,
        search: search.trim() || undefined,
        vehicleId: vehicleFilter.vehicleId || undefined,
        vehicleBrand: vehicleFilter.brand || undefined,
        vehicleModel: vehicleFilter.modelName || undefined,
        status: statusFilter || undefined,
      })
      if (result.success && result.data) {
        setMembers(result.data.items || [])
        setPage(result.data.page || requestedPage)
        setTotal(result.data.total || 0)
        setTotalPages(Math.max(1, result.data.totalPages || 1))
        if (result.data.stats) {setStats(result.data.stats)}
      }
    } catch {
      showToast({ type: 'error', title: '会员数据加载失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 250)
    return () => window.clearTimeout(timer)
  }, [search, vehicleFilter, statusFilter])

  useEffect(() => {
    getMemberVehicleFilterOptions()
      .then((result) => {
        if (result.success) {
          setVehicleOptions(result.data || [])
        }
      })
      .catch(() => showToast({ type: 'error', title: '车辆筛选选项加载失败' }))
      .finally(() => setVehicleOptionsLoading(false))
  }, [showToast])

  const updateStatus = async (member: MemberRecord, status: 'active' | 'suspended') => {
    const result = await setMemberStatus(member._id, status)
    if (result.success) {
      showToast({ type: 'success', title: status === 'active' ? '会员账号已恢复' : '会员账号已停用' })
      setSelectedMember(null)
      await load(page)
    } else {
      showToast({ type: 'error', title: '会员状态更新失败' })
    }
  }

  if (loading && members.length === 0) {return <div className="p-6 text-slate-500">加载中...</div>}

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-cyan-600">账号管理</p><h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">会员管理</h2></div>
        <p className="text-sm text-slate-500">在线状态按最近 5 分钟活动统计</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric title="会员总数" value={stats.total} icon={<Users className="h-5 w-5" />} tone="blue" />
        <Metric title="当前在线" value={stats.online} icon={<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />} tone="green" />
        <Metric title="可用账号" value={stats.active} icon={<UserCheck className="h-5 w-5" />} tone="indigo" />
      </div>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">会员账号 <span className="text-sm font-normal text-slate-500">{total}</span></CardTitle>
            <div className="grid w-full gap-2 sm:grid-cols-[minmax(16rem,18rem)_auto] xl:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮箱、昵称或 IP" /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="suspended">已停用</option></select>
            </div>
          </div>
          <MemberVehicleFilter options={vehicleOptions} value={vehicleFilter} loading={vehicleOptionsLoading} onChange={setVehicleFilter} />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><th className="p-3">会员</th><th className="p-3">状态</th><th className="p-3">车辆</th><th className="p-3">最近活动</th><th className="p-3">设备</th><th className="p-3">地区 / IP</th><th className="p-3">注册时间</th><th className="p-3">操作</th></tr></thead>
              <tbody>{members.map((member) => (
                <tr key={member._id} className="border-b border-slate-100 align-top dark:border-slate-800">
                  <td className="p-3"><div className="font-medium text-slate-900 dark:text-white">{member.nickname}</div><div className="mt-0.5 text-xs text-slate-500">{member.email}</div></td>
                  <td className="p-3">{member.status === 'suspended' ? <Badge size="sm" variant="error">已停用</Badge> : <Badge size="sm" variant={member.isOnline ? 'success' : 'outline'}>{member.isOnline ? '在线' : '离线'}</Badge>}</td>
                  <td className="p-3"><button type="button" onClick={() => setSelectedMember(member)} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"><CarFront className="h-4 w-4" />{member.vehicleCount || 0} 辆</button></td>
                  <td className="p-3 text-xs text-slate-600 dark:text-slate-300">{formatDate(member.lastActivityAt)}</td>
                  <td className="p-3"><div className="flex items-center gap-2"><DeviceIcon type={member.lastSeenDeviceType} /><span>{DEVICE_LABELS[member.lastSeenDeviceType]}</span></div><div className="mt-1 text-xs text-slate-500">{member.lastSeenOs || '未知'} · {member.lastSeenBrowser || '未知'}</div></td>
                  <td className="p-3"><div className="text-xs">{[member.registrationCountry, member.registrationRegion, member.registrationCity].filter(Boolean).join(' / ') || '未知'}</div><div className="mt-1 text-xs text-slate-500">{member.lastSeenIp || member.registrationIp || '未知 IP'}</div></td>
                  <td className="p-3 text-xs text-slate-500">{formatDate(member.createdAt)}</td>
                  <td className="p-3"><div className="flex items-center gap-1"><button type="button" onClick={() => setSelectedMember(member)} className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30" title="查看会员详情" aria-label="查看会员详情"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => void updateStatus(member, member.status === 'active' ? 'suspended' : 'active')} className={member.status === 'active' ? 'rounded-md p-1.5 text-red-600 hover:bg-red-50' : 'rounded-md p-1.5 text-blue-600 hover:bg-blue-50'} title={member.status === 'active' ? '停用账号' : '恢复账号'} aria-label={member.status === 'active' ? '停用账号' : '恢复账号'}><UserCheck className="h-4 w-4" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {members.length === 0 && <div className="py-12 text-center text-sm text-slate-500">没有匹配的会员</div>}
          {totalPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-slate-700"><span className="text-slate-500">第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void load(page - 1)} disabled={page <= 1}><ChevronLeft className="mr-1 h-4 w-4" />上一页</Button><Button size="sm" variant="outline" onClick={() => void load(page + 1)} disabled={page >= totalPages}>下一页<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
        </CardContent>
      </Card>
      <Modal isOpen={Boolean(selectedMember)} onClose={() => setSelectedMember(null)} title="会员详情" size="lg">
        {selectedMember && <div className="space-y-6">
          <section className="grid gap-4 border-b border-slate-200 pb-6 text-sm dark:border-slate-700 sm:grid-cols-2"><Detail label="昵称" value={selectedMember.nickname} /><Detail label="邮箱" value={selectedMember.email} /><Detail label="注册时间" value={formatDate(selectedMember.createdAt)} /><Detail label="最后活动" value={formatDate(selectedMember.lastActivityAt)} /><Detail label="注册地区" value={[selectedMember.registrationCountry, selectedMember.registrationRegion, selectedMember.registrationCity].filter(Boolean).join(' / ') || '未知'} /><Detail label="最近 IP" value={selectedMember.lastSeenIp || selectedMember.registrationIp || '未知'} /></section>
          <section>
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><CarFront className="h-5 w-5 text-blue-600" />会员车辆</h3><span className="text-sm text-slate-500">{selectedMember.vehicleCount || 0} 辆</span></div>
            {selectedMember.vehicles?.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{selectedMember.vehicles.map((vehicle) => <div key={vehicle._id} className="min-h-28 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><p className="font-medium text-slate-900 dark:text-white">{vehicle.nickname || `${vehicle.brand} ${vehicle.modelName}`}</p>{vehicle.isDefault && <Badge size="sm" variant="info">默认车辆</Badge>}</div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{vehicle.brand} {vehicle.modelName}</p><p className="mt-1 text-xs text-slate-500">{vehicle.yearRange}{vehicle.generation ? ` · ${vehicle.generation}` : ''}</p></div>)}</div> : <div className="mt-4 rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">该会员暂未添加车辆</div>}
          </section>
        </div>}
      </Modal>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-all text-slate-900 dark:text-white">{value}</p></div>
}

function Metric({ title, value, icon, tone }: { title: string; value: number; icon: ReactNode; tone: 'blue' | 'green' | 'indigo' }) {
  const colors = { blue: 'border-blue-200 bg-blue-50 text-blue-600', green: 'border-emerald-200 bg-emerald-50 text-emerald-600', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-600' }
  return <div className={`rounded-lg border p-4 ${colors[tone]}`}><div className="flex items-center justify-between"><span className="text-sm font-medium">{title}</span><span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/70">{icon}</span></div><p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p></div>
}

export default MemberManagement
