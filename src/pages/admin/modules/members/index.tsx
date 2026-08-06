import { useEffect, useState } from 'react'
import { Check, Copy, UserCheck, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { createMemberInvitation, getMemberAdminSettings, getMemberInvitations, getMembers, saveMemberAdminSettings, setMemberStatus, toggleMemberInvitation, type MemberRecord } from '@/services/memberAdminService'

export function MemberManagement() {
  const { showToast } = useToast()
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [settings, setSettings] = useState({ registrationEnabled: true, approvalRequired: false, invitationRequired: false })
  const [invitations, setInvitations] = useState<any[]>([])
  const [maxUses, setMaxUses] = useState('1')
  const [note, setNote] = useState('')
  const [newCode, setNewCode] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [memberRes, settingsRes, invitationRes] = await Promise.all([getMembers({ limit: 100 }), getMemberAdminSettings(), getMemberInvitations()])
    if (memberRes.success) {setMembers(memberRes.data?.items || [])}
    if (settingsRes.success && settingsRes.data) {setSettings({ registrationEnabled: settingsRes.data.registrationEnabled, approvalRequired: settingsRes.data.approvalRequired, invitationRequired: settingsRes.data.invitationRequired })}
    if (invitationRes.success) {setInvitations(invitationRes.data || [])}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saveSettings = async () => {
    const result = await saveMemberAdminSettings(settings)
    showToast({ type: result.success ? 'success' : 'error', title: result.success ? '会员注册设置已保存' : '保存失败' })
  }

  const review = async (member: MemberRecord, status: 'active' | 'rejected' | 'suspended') => {
    const result = await setMemberStatus(member._id, status)
    if (result.success) { showToast({ type: 'success', title: '会员状态已更新' }); await load() }
    else {showToast({ type: 'error', title: '更新失败' })}
  }

  const createInvite = async () => {
    const result = await createMemberInvitation({ maxUses: Number(maxUses) || 1, note })
    if (result.success) { setNewCode(result.code); setNote(''); await load() }
    else {showToast({ type: 'error', title: '邀请码创建失败' })}
  }

  if (loading) {return <div className="p-6 text-slate-500">加载中...</div>}
  return <div className="mx-auto w-full max-w-[1400px] space-y-6">
    <div><h2 className="text-2xl font-semibold text-slate-900 dark:text-white">会员管理</h2></div>
    <Card><CardHeader><CardTitle>注册规则</CardTitle></CardHeader><CardContent className="space-y-4">
      <ToggleRow label="开放会员注册" checked={settings.registrationEnabled} onChange={(v) => setSettings({ ...settings, registrationEnabled: v })} />
      <ToggleRow label="注册后需要管理员审批" checked={settings.approvalRequired} onChange={(v) => setSettings({ ...settings, approvalRequired: v })} />
      <ToggleRow label="注册必须填写邀请码" checked={settings.invitationRequired} onChange={(v) => setSettings({ ...settings, invitationRequired: v })} />
      <Button onClick={saveSettings}>保存规则</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>邀请码</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2"><Input className="w-28" type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="使用次数" /><Input className="min-w-[220px] flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" /><Button onClick={createInvite}>生成邀请码</Button></div>
      {newCode && <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-green-800 dark:bg-green-950/30 dark:text-green-200"><code className="font-mono font-semibold">{newCode}</code><button title="复制邀请码" onClick={() => navigator.clipboard.writeText(newCode)}><Copy className="h-4 w-4" /></button></div>}
      <div className="divide-y divide-slate-200 dark:divide-slate-700">{invitations.map((item) => <div key={item._id} className="flex items-center justify-between py-3 text-sm"><span>{item.prefix}•••• · {item.usedCount}/{item.maxUses}{item.note ? ` · ${item.note}` : ''}</span><button onClick={async () => { await toggleMemberInvitation(item._id, !item.enabled); await load() }} className={item.enabled ? 'text-green-600' : 'text-slate-400'}>{item.enabled ? '启用' : '停用'}</button></div>)}</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>会员账号 ({members.length})</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700"><th className="p-3">会员</th><th className="p-3">注册地区 / IP</th><th className="p-3">状态</th><th className="p-3">注册时间</th><th className="p-3">操作</th></tr></thead><tbody>{members.map((member) => <tr key={member._id} className="border-b border-slate-100 dark:border-slate-800"><td className="p-3"><div>{member.nickname}</div><div className="text-xs text-slate-500">{member.email}</div></td><td className="p-3"><div>{member.registrationCountry} · {member.registrationRegion} · {member.registrationCity}</div><div className="text-xs text-slate-500">{member.registrationIp || '未知'}</div></td><td className="p-3"><Badge variant={member.status === 'active' ? 'success' : member.status === 'pending' ? 'warning' : 'secondary'}>{member.status}</Badge></td><td className="p-3 text-slate-500">{new Date(member.createdAt).toLocaleString()}</td><td className="p-3"><div className="flex gap-2">{member.status === 'pending' && <><button title="通过" onClick={() => review(member, 'active')} className="text-green-600"><Check className="h-4 w-4" /></button><button title="拒绝" onClick={() => review(member, 'rejected')} className="text-red-600"><X className="h-4 w-4" /></button></>}{member.status === 'active' && <button title="停用" onClick={() => review(member, 'suspended')} className="text-red-600"><UserCheck className="h-4 w-4" /></button>}{member.status === 'suspended' && <button title="恢复" onClick={() => review(member, 'active')} className="text-blue-600"><UserCheck className="h-4 w-4" /></button>}</div></td></tr>)}</tbody></table></div></CardContent></Card>
  </div>
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200"><span>{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'left-6' : 'left-1'}`} /></button></label> }

export default MemberManagement
