import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  Camera,
  CheckCircle2,
  ExternalLink,
  Heart,
  LockKeyhole,
  LogOut,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMemberFavorites,
  getMemberForumSummary,
  getMemberProfile,
  removeMemberFavorite,
  updateMemberPassword,
  updateMemberProfile,
  uploadMemberAvatar,
  type ForumMemberSummary,
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
import { getForumBaseUrl } from '@/utils/forumUrl'

type Tab = 'overview' | 'security' | 'saved'

const forumNotificationKey = (type: string) => {
  const keys: Record<string, string> = {
    newPost: 'newPost',
    userMentioned: 'mention',
    postMentioned: 'mention',
    postLiked: 'like',
    discussionLocked: 'moderation',
    privateDiscussionReplied: 'privateMessage',
    privateDiscussionCreated: 'privateMessage',
  }
  return keys[type] || 'activity'
}

export default function MemberProfilePage() {
  const { t, i18n } = useTranslation()
  const { user, loading: authLoading, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<MemberProfile | AdminProfile | null>(null)
  const [favorites, setFavorites] = useState<MemberFavorite[]>([])
  const [forum, setForum] = useState<ForumMemberSummary | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [nickname, setNickname] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const translateError = (errorCode?: string, fallbackKey = 'errors.generic') =>
    errorCode
      ? t(`memberAccess.errors.${errorCode}`, { defaultValue: errorCode })
      : t(`memberProfile.${fallbackKey}`)

  useEffect(() => {
    if (!user) {
      return
    }
    const profileRequest = user.type === 'member' ? getMemberProfile() : getAdminProfile()
    const favoritesRequest = user.type === 'member' ? getMemberFavorites() : getAdminFavorites()
    const forumRequest =
      user.type === 'member'
        ? getMemberForumSummary()
        : Promise.resolve({ success: true, data: null })
    Promise.all([profileRequest, favoritesRequest, forumRequest])
      .then(([profileResult, favoriteResult, forumResult]) => {
        if (profileResult.success) {
          setProfile(profileResult.data || null)
          setNickname(profileResult.data?.nickname || user.nickname)
        }
        if (favoriteResult.success) {
          setFavorites(favoriteResult.data || [])
        }
        if (forumResult.success && forumResult.data) {
          setForum(forumResult.data)
        }
        if (!profileResult.success || !favoriteResult.success) {
          setError(t('memberProfile.profileLoadFailed'))
        }
      })
      .catch(() => setError(t('memberProfile.profileLoadFailed')))
  }, [t, user])

  if (authLoading) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400">
        {t('memberProfile.loading')}
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login?returnTo=/profile" replace />
  }

  const saveNickname = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const result =
      user.type === 'member'
        ? await updateMemberProfile({ nickname: nickname.trim() })
        : await updateOwnNickname(nickname.trim())
    if (result.success) {
      setProfile((current) =>
        current ? { ...current, nickname: result.data?.nickname || nickname.trim() } : current
      )
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
    const result =
      user.type === 'member'
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
    if (!file) {
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    const result =
      user.type === 'member' ? await uploadMemberAvatar(file) : await uploadAdminAvatar(file)
    if (result.success) {
      setProfile((current) => (current ? { ...current, avatar: result.data.avatar } : current))
      await refresh()
      setMessage(t('memberProfile.avatarUpdated'))
    } else {
      setError(translateError(result.error, 'avatarUploadFailed'))
    }
    setBusy(false)
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  const removeFavorite = async (documentId: string) => {
    const result =
      user.type === 'member'
        ? await removeMemberFavorite(documentId)
        : await removeAdminFavorite(documentId)
    if (result.success) {
      setFavorites((items) => items.filter((item) => item.documentId !== documentId))
    }
  }

  const dateLocale = i18n.language === 'zh' ? 'zh-CN' : 'en-US'
  const supportsPassword =
    user.type === 'member' || (profile as AdminProfile | null)?.provider === 'email'
  const avatar = profile?.avatar || user.avatar
  const displayName = profile?.nickname || user.nickname
  const inputClassName =
    'mt-1.5 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400'
  const tabs: Array<{ id: Tab; label: string; icon: typeof UserRound }> = [
    { id: 'overview', label: t('memberProfile.overview'), icon: UserRound },
    { id: 'security', label: t('memberProfile.security'), icon: LockKeyhole },
    { id: 'saved', label: t('memberProfile.favorites'), icon: Heart },
  ]

  return (
    <div className="member-profile-page page-container min-h-[calc(100vh-4rem)] bg-slate-50/70 dark:bg-slate-950/30">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-7 flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 dark:border-slate-800 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              {t('memberProfile.eyebrow')}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {t('memberProfile.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t('memberProfile.description')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/knowledge')}
              className="text-sm font-medium text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
            >
              {t('memberProfile.backToKnowledge')}
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout()
                navigate('/')
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-200 dark:hover:border-red-900 dark:hover:bg-red-950/30"
            >
              <LogOut className="h-4 w-4" />
              {t('memberProfile.logout')}
            </button>
          </div>
        </div>
        {(error || message) && (
          <div
            className={`mb-5 rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'}`}
          >
            {error || message}
          </div>
        )}

        <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-7 w-7" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="absolute -bottom-1 -right-1 rounded-full bg-blue-600 p-1.5 text-white shadow hover:bg-blue-700 disabled:opacity-50"
                  title={t('memberProfile.changeAvatar')}
                  aria-label={t('memberProfile.changeAvatar')}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={uploadAvatar}
                  className="hidden"
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  {displayName}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {profile?.email || t('memberProfile.account')}
                </p>
              </div>
            </div>
            <div className="flex gap-3 text-sm">
              <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('memberProfile.savedCount')}
                </p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {favorites.length}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('memberProfile.forumUnread')}
                </p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {forum?.unreadCount ?? '-'}
                </p>
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 dark:border-slate-800 sm:px-6">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${tab === id ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </section>

        {tab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
                <UserRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t('memberProfile.basicInfo')}
              </h2>
              <form
                onSubmit={saveNickname}
                className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <label className="flex-1 text-sm text-slate-600 dark:text-slate-300">
                  {t('memberProfile.nickname')}
                  <input
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    minLength={2}
                    maxLength={50}
                    required
                    className={inputClassName}
                  />
                </label>
                <button
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 max-sm:mr-12"
                >
                  <Save className="h-4 w-4" />
                  {t('memberProfile.save')}
                </button>
              </form>
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm dark:border-slate-800 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('memberProfile.email')}
                  </p>
                  <p className="mt-1 break-all text-slate-900 dark:text-white">
                    {profile?.email || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('memberProfile.memberSince')}
                  </p>
                  <p className="mt-1 text-slate-900 dark:text-white">
                    {profile?.createdAt
                      ? new Date(profile.createdAt).toLocaleDateString(dateLocale)
                      : '-'}
                  </p>
                </div>
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
                    <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    {t('memberProfile.forum')}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {forum?.linked
                      ? forum.nickname || forum.username
                      : t('memberProfile.forumNotLinked')}
                  </p>
                </div>
                {forum?.linked && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              </div>
              {forum?.linked ? (
                <>
                  <div className="mt-5 rounded-md bg-blue-50 p-4 dark:bg-blue-950/30">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {t('memberProfile.unreadMessages')}
                    </p>
                    <p className="mt-1 text-3xl font-semibold text-blue-950 dark:text-blue-100">
                      {forum.unreadCount}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {forum.notifications.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-start gap-3 text-sm">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-600'}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-slate-700 dark:text-slate-200">
                            {t(
                              `memberProfile.forumNotifications.${forumNotificationKey(item.type)}`
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {new Date(item.createdAt).toLocaleString(dateLocale)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <a
                    href={getForumBaseUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    {t('memberProfile.openForum')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </>
              ) : (
                <div className="mt-5 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {forum?.available === false
                    ? t('memberProfile.forumUnavailable')
                    : t('memberProfile.forumNotLinked')}
                  <a
                    href={getForumBaseUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400"
                  >
                    {t('memberProfile.openForum')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'security' && supportsPassword && (
          <section className="max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
              <LockKeyhole className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t('memberProfile.changePassword')}
            </h2>
            <form onSubmit={changePassword} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                {t('memberProfile.currentPassword')}
                <input
                  required
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className={inputClassName}
                />
              </label>
              <label className="text-sm text-slate-600 dark:text-slate-300">
                {t('memberProfile.newPassword')}
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  className={inputClassName}
                />
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">
                {t('memberProfile.passwordHint')}
              </p>
              <button
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40 sm:col-start-2"
              >
                <Save className="h-4 w-4" />
                {t('memberProfile.updatePassword')}
              </button>
            </form>
          </section>
        )}

        {tab === 'saved' && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
              <Heart className="h-5 w-5 text-rose-500" />
              {t('memberProfile.favorites')}{' '}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                {favorites.length}
              </span>
            </h2>
            {favorites.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                {t('memberProfile.emptyFavorites')}
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {favorites.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 py-4">
                    <button
                      type="button"
                      onClick={() => navigate(item.url)}
                      className="min-w-0 text-left"
                    >
                      <h3 className="truncate font-medium text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                        {item.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                        {item.summary}
                      </p>
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        {t('memberProfile.updatedAt', {
                          time: new Date(item.updatedAt).toLocaleString(dateLocale),
                        })}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeFavorite(item.documentId)}
                      className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
                      title={t('memberProfile.removeFavorite')}
                      aria-label={t('memberProfile.removeFavorite')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
