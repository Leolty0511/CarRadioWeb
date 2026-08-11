import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Heart, LockKeyhole, LogOut, Save, Trash2, UserRound } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMemberFavorites,
  getMemberProfile,
  removeMemberFavorite,
  updateMemberPassword,
  updateMemberProfile,
  uploadMemberAvatar,
  type MemberFavorite,
  type MemberProfile,
} from '@/services/memberAuthService'
import {
  getAdminFavorites,
  getAdminProfile,
  removeAdminFavorite,
  updateAdminPassword,
  updateOwnNickname,
  uploadAdminAvatar,
  type AdminProfile,
} from '@/services/userService'

export default function MemberProfilePage() {
  const { t, i18n } = useTranslation()
  const { user, loading: authLoading, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<MemberProfile | AdminProfile | null>(null)
  const [favorites, setFavorites] = useState<MemberFavorite[]>([])
  const [nickname, setNickname] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const translateError = (errorCode?: string, fallbackKey = 'errors.generic') => {
    if (!errorCode) {return t(`memberProfile.${fallbackKey}`)}
    return t(`memberAccess.errors.${errorCode}`, { defaultValue: errorCode })
  }

  useEffect(() => {
    if (!user) {return}
    const profileRequest = user.type === 'member' ? getMemberProfile() : getAdminProfile()
    const favoritesRequest = user.type === 'member' ? getMemberFavorites() : getAdminFavorites()
    Promise.all([profileRequest, favoritesRequest]).then(([profileResult, favoriteResult]) => {
      if (profileResult.success) {
        setProfile(profileResult.data || null)
        setNickname(profileResult.data?.nickname || user.nickname)
      }
      if (favoriteResult.success) {setFavorites(favoriteResult.data || [])}
      if (!profileResult.success || !favoriteResult.success) {setError(t('memberProfile.profileLoadFailed'))}
    }).catch(() => setError(t('memberProfile.profileLoadFailed')))
  }, [t, user])

  if (authLoading) {return <div className="p-12 text-center text-slate-500 dark:text-slate-400">{t('memberProfile.loading')}</div>}
  if (!user) {return <Navigate to="/login?returnTo=/profile" replace />}

  const saveNickname = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const result = user.type === 'member'
      ? await updateMemberProfile({ nickname: nickname.trim() })
      : await updateOwnNickname(nickname.trim())
    if (result.success) {
      setProfile(current => current ? { ...current, nickname: result.data?.nickname || nickname.trim() } : current)
      await refresh()
      setMessage(t('memberProfile.nicknameUpdated'))
    } else {
      setError(translateError(result.error, 'nicknameUpdateFailed'))
    }
    setBusy(false)
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const result = user.type === 'member'
      ? await updateMemberPassword(currentPassword, newPassword)
      : await updateAdminPassword(currentPassword, newPassword)
    if (result.success) {
      setCurrentPassword('')
      setNewPassword('')
      setMessage(t('memberProfile.passwordUpdated'))
    } else if (result.error === 'current_password_invalid') {
      setError(t('memberProfile.currentPasswordInvalid'))
    } else {
      setError(translateError(result.error, 'passwordUpdateFailed'))
    }
    setBusy(false)
  }

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {return}
    setBusy(true)
    setError('')
    setMessage('')
    const result = user.type === 'member' ? await uploadMemberAvatar(file) : await uploadAdminAvatar(file)
    if (result.success) {
      setProfile(current => current ? { ...current, avatar: result.data.avatar } : current)
      await refresh()
      setMessage(t('memberProfile.avatarUpdated'))
    } else {
      setError(translateError(result.error, 'avatarUploadFailed'))
    }
    setBusy(false)
    if (fileRef.current) {fileRef.current.value = ''}
  }

  const removeFavorite = async (documentId: string) => {
    const result = user.type === 'member' ? await removeMemberFavorite(documentId) : await removeAdminFavorite(documentId)
    if (result.success) {setFavorites(items => items.filter(item => item.documentId !== documentId))}
  }

  const dateLocale = i18n.language === 'zh' ? 'zh-CN' : 'en-US'
  const supportsPassword = user.type === 'member' || (profile as AdminProfile | null)?.provider === 'email'
  const inputClassName = 'mt-1.5 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400'
  const compactInputClassName = 'w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400'

  return (
    <div className="member-profile-page page-container">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">{t('memberProfile.eyebrow')}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">{t('memberProfile.title')}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('memberProfile.description')}</p>
        </div>

        {(error || message) && (
          <div className={`mb-5 rounded-lg p-3 text-sm ${error ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
            {error || message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="self-start rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  {profile?.avatar || user.avatar
                    ? <img src={profile?.avatar || user.avatar} alt="" className="h-full w-full object-cover" />
                    : <UserRound className="h-10 w-10" />}
                </div>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="absolute bottom-0 right-0 rounded-full bg-blue-600 p-2 text-white shadow hover:bg-blue-700 disabled:opacity-50" title={t('memberProfile.changeAvatar')} aria-label={t('memberProfile.changeAvatar')}>
                  <Camera className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} className="hidden" />
              </div>
              <h2 className="mt-4 font-semibold text-slate-900 dark:text-white">{profile?.nickname || user.nickname}</h2>
              <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{profile?.email || t('memberProfile.account')}</p>
              <button type="button" onClick={() => navigate('/knowledge')} className="mt-6 w-full rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">{t('memberProfile.backToKnowledge')}</button>
              <button type="button" onClick={async () => { await logout(); navigate('/') }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:text-slate-200 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-300"><LogOut className="h-4 w-4" />{t('memberProfile.logout')}</button>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><UserRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />{t('memberProfile.basicInfo')}</h2>
              <form onSubmit={saveNickname} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm text-slate-600 dark:text-slate-300">{t('memberProfile.nickname')}
                  <input value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={50} required className={inputClassName} />
                </label>
                <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" />{t('memberProfile.save')}</button>
              </form>
            </section>

            {supportsPassword && <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><LockKeyhole className="h-5 w-5 text-blue-600 dark:text-blue-400" />{t('memberProfile.changePassword')}</h2>
              <form onSubmit={changePassword} className="mt-5 grid gap-3 sm:grid-cols-3">
                <input required type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder={t('memberProfile.currentPassword')} autoComplete="current-password" className={compactInputClassName} />
                <input required type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder={t('memberProfile.newPassword')} autoComplete="new-password" className={compactInputClassName} />
                <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"><Save className="h-4 w-4" />{t('memberProfile.updatePassword')}</button>
                <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-3">{t('memberProfile.passwordHint')}</p>
              </form>
            </section>}

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Heart className="h-5 w-5 text-rose-500" />{t('memberProfile.favorites')} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{favorites.length}</span></h2>
              {favorites.length === 0
                ? <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">{t('memberProfile.emptyFavorites')}</p>
                : <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {favorites.map(item => (
                      <div key={item.id} className="flex items-start justify-between gap-4 py-4">
                        <button type="button" onClick={() => navigate(item.url)} className="min-w-0 text-left">
                          <h3 className="truncate font-medium text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">{item.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.summary}</p>
                          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t('memberProfile.updatedAt', { time: new Date(item.updatedAt).toLocaleString(dateLocale) })}</p>
                        </button>
                        <button type="button" onClick={() => void removeFavorite(item.documentId)} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30" title={t('memberProfile.removeFavorite')} aria-label={t('memberProfile.removeFavorite')}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>}
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
