import { useEffect, useRef, useState } from 'react'
import { Camera, Heart, LockKeyhole, Save, Trash2, UserRound } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getMemberFavorites, getMemberProfile, removeMemberFavorite, updateMemberPassword, updateMemberProfile, uploadMemberAvatar, type MemberFavorite, type MemberProfile } from '@/services/memberAuthService'

export default function MemberProfilePage() {
  const { user, loading: authLoading, refresh } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [favorites, setFavorites] = useState<MemberFavorite[]>([])
  const [nickname, setNickname] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user?.type !== 'member') return
    Promise.all([getMemberProfile(), getMemberFavorites()]).then(([profileResult, favoriteResult]) => {
      if (profileResult.success) { setProfile(profileResult.data); setNickname(profileResult.data.nickname) }
      if (favoriteResult.success) setFavorites(favoriteResult.data || [])
    }).catch(() => setError('个人资料加载失败'))
  }, [user?.type])

  if (authLoading) return <div className="p-12 text-center text-slate-500">加载中...</div>
  if (!user || user.type !== 'member') return <Navigate to="/login?returnTo=/profile" replace />

  const saveNickname = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const result = await updateMemberProfile({ nickname: nickname.trim() })
    if (result.success) { setProfile(result.data); await refresh(); setMessage('昵称已更新') } else setError(result.error || '昵称更新失败')
    setBusy(false)
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const result = await updateMemberPassword(currentPassword, newPassword)
    if (result.success) { setCurrentPassword(''); setNewPassword(''); setMessage('密码已更新') } else setError(result.error === 'current_password_invalid' ? '当前密码不正确' : result.error || '密码更新失败')
    setBusy(false)
  }

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    setBusy(true); setError(''); setMessage('')
    const result = await uploadMemberAvatar(file)
    if (result.success) { setProfile(current => current ? { ...current, avatar: result.data.avatar } : current); await refresh(); setMessage('头像已更新') } else setError(result.error || '头像上传失败')
    setBusy(false); if (fileRef.current) fileRef.current.value = ''
  }

  const removeFavorite = async (documentId: string) => {
    const result = await removeMemberFavorite(documentId)
    if (result.success) setFavorites(items => items.filter(item => item.documentId !== documentId))
  }

  return <div className="page-container"><div className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><div className="mb-8"><p className="text-sm font-medium uppercase tracking-wider text-blue-600">MEMBER CENTER</p><h1 className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">个人中心</h1><p className="mt-2 text-sm text-slate-500">管理你的会员资料和收藏内容</p></div>{(error || message) && <div className={`mb-5 rounded-lg p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-col items-center text-center"><div className="relative"><div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950">{profile?.avatar || user.avatar ? <img src={profile?.avatar || user.avatar} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10" />}</div><button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="absolute bottom-0 right-0 rounded-full bg-blue-600 p-2 text-white shadow hover:bg-blue-700" title="更换头像"><Camera className="h-4 w-4" /></button><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} className="hidden" /></div><h2 className="mt-4 font-semibold text-slate-900 dark:text-white">{profile?.nickname || user.nickname}</h2><p className="mt-1 break-all text-sm text-slate-500">{profile?.email || '会员账号'}</p><button type="button" onClick={() => navigate('/knowledge')} className="mt-6 w-full rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">返回知识库</button></div></aside><main className="space-y-6"><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><UserRound className="h-5 w-5 text-blue-600" />基本资料</h2><form onSubmit={saveNickname} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm text-slate-600 dark:text-slate-300">昵称<input value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={50} required className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" /></label><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" />保存</button></form></section><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><LockKeyhole className="h-5 w-5 text-blue-600" />修改密码</h2><form onSubmit={changePassword} className="mt-5 grid gap-3 sm:grid-cols-3"><input required type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="当前密码" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" /><input required type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="新密码（至少 10 位）" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800" /><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 disabled:opacity-50"><Save className="h-4 w-4" />更新密码</button></form></section><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Heart className="h-5 w-5 text-rose-500" />我的收藏 <span className="text-sm font-normal text-slate-500">{favorites.length}</span></h2>{favorites.length === 0 ? <p className="mt-5 text-sm text-slate-500">还没有收藏内容，在知识库文章中点击收藏即可。</p> : <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{favorites.map(item => <div key={item.id} className="flex items-start justify-between gap-4 py-4"><button type="button" onClick={() => navigate(item.url)} className="min-w-0 text-left"><h3 className="truncate font-medium text-slate-900 hover:text-blue-600 dark:text-white">{item.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.summary}</p><p className="mt-2 text-xs text-slate-400">更新于 {new Date(item.updatedAt).toLocaleString('zh-CN')}</p></button><button type="button" onClick={() => void removeFavorite(item.documentId)} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="取消收藏"><Trash2 className="h-4 w-4" /></button></div>)}</div>}</section></main></div></div></div>
}
