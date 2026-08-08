import { useCallback, useEffect, useState } from 'react'
import { Clock3, Globe2, Monitor, Smartphone, Tablet, Users } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { getOnlineMembers } from '@/services/memberAdminService'
import { useAuth } from '@/contexts/AuthContext'

type OnlineMember = NonNullable<Awaited<ReturnType<typeof getOnlineMembers>>['data']>['items'][number]

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '暂无记录'
}

function DeviceIcon({ type }: { type: OnlineMember['lastSeenDeviceType'] }) {
  if (type === 'mobile') {return <Smartphone className="h-4 w-4" />}
  if (type === 'tablet') {return <Tablet className="h-4 w-4" />}
  return <Monitor className="h-4 w-4" />
}

export default function OnlineMembersBubble() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const [members, setMembers] = useState<OnlineMember[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const isAdmin = user?.type === 'admin'
  const load = useCallback(async () => {
    if (!isAdmin) {return}
    setLoading(true)
    try {
      const result = await getOnlineMembers()
      if (result.success && result.data) {
        setCount(result.data.count)
        setMembers(result.data.items)
      }
    } catch {
      // Presence is supplementary and must never affect knowledge-base browsing.
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {return}
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [isAdmin, load])

  if (!isAdmin) {return null}

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load() }}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-cyan-200/60 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(8,47,73,0.35)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-300"
        aria-label="查看在线会员"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <Users className="h-4 w-4 text-cyan-200" />
        <span>在线会员 {count}</span>
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="在线会员" size="lg">
        <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/25">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"><Users className="h-4 w-4" /></span>
            <div><p className="font-semibold text-slate-900 dark:text-white">当前在线 {count} 人</p><p className="text-xs text-slate-500">按最近 5 分钟活动判断</p></div>
          </div>
          {loading && <span className="text-xs text-slate-500">更新中...</span>}
        </div>

        {members.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">当前没有在线会员</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {members.map((member) => (
              <div key={`${member.email}-${member.lastSeenAt}`} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-white">{member.nickname}</p>
                  <p className="truncate text-xs text-slate-500">{member.email}</p>
                </div>
                <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
                  <p className="flex items-center gap-2"><DeviceIcon type={member.lastSeenDeviceType} />{member.lastSeenDeviceType} · {member.lastSeenOs || 'Unknown'}</p>
                  <p className="truncate pl-6 text-xs text-slate-500">{member.lastSeenBrowser || 'Unknown'} {member.lastSeenBrowserVersion}</p>
                </div>
                <div className="text-xs text-slate-500 sm:text-right">
                  <p className="flex items-center gap-1 sm:justify-end"><Clock3 className="h-3.5 w-3.5" />{formatTime(member.lastSeenAt)}</p>
                  <p className="mt-1 flex items-center gap-1 sm:justify-end"><Globe2 className="h-3.5 w-3.5" />{[member.registrationCountry, member.registrationRegion, member.registrationCity].filter(Boolean).join(' / ') || '未知地区'}</p>
                  <p className="mt-1 text-[11px]">{member.lastSeenIp || '未知 IP'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}
