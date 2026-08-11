import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LockKeyhole, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { memberLogin, registerMember, resetMemberPassword, sendMemberCode } from '@/services/memberAuthService'

type Mode = 'login' | 'register' | 'reset'

export default function MemberAccess() {
  const { t } = useTranslation()
  const { isAuthenticated, loading: sessionLoading, refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const returnToRaw = params.get('returnTo') || '/knowledge'
  const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/knowledge'

  const run = async (action: () => Promise<Record<string, unknown>>) => {
    setBusy(true); setError(''); setMessage('')
    try { return await action() } finally { setBusy(false) }
  }
  const showError = (result: Record<string, unknown>) => {
    const code = String(result.error || '')
    const translated = code ? t(`memberAccess.errors.${code}`, { defaultValue: '' }) : ''
    setError(translated || String(result.message || t('memberAccess.errors.generic')))
  }

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault(); const result = await run(() => memberLogin(login, password))
    if (result.success) { await refresh(); navigate(returnTo, { replace: true }) } else {showError(result)}
  }
  const sendCode = async () => {
    const result = await run(() => sendMemberCode(email, mode === 'reset' ? 'reset_password' : 'register'))
    if (result.success) {setMessage(t('memberAccess.codeSent'))} else {showError(result)}
  }
  const submitRegister = async (event: React.FormEvent) => {
    event.preventDefault(); const result = await run(() => registerMember({ email, nickname, password, code }))
    if (result.success) { await refresh(); navigate(returnTo, { replace: true }) } else {showError(result)}
  }
  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault(); const result = await run(() => resetMemberPassword(email, code, password))
    if (result.success) { setMode('login'); setLogin(email); setMessage(t('memberAccess.passwordReset')) } else {showError(result)}
  }

  if (!sessionLoading && isAuthenticated) {return <Navigate to={returnTo === '/knowledge' ? '/profile' : returnTo} replace />}

  return <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950"><div className="mx-auto w-full max-w-lg"><div className="mb-6 text-center"><LockKeyhole className="mx-auto mb-3 h-9 w-9 text-blue-600" /><h1 className="text-3xl font-semibold text-slate-900 dark:text-white">{t('memberAccess.title')}</h1></div><div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-700 dark:bg-slate-900"><div className="mb-5 grid grid-cols-3 border-b border-slate-200 dark:border-slate-700">{(['login', 'register', 'reset'] as Mode[]).map(item => <button key={item} type="button" onClick={() => { setMode(item); setError(''); setMessage('') }} className={`border-b-2 px-2 py-2 text-sm ${mode === item ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>{t(`memberAccess.tabs.${item}`)}</button>)}</div>{error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</div>}{mode === 'login' ? <form onSubmit={submitLogin} className="space-y-4"><Field label={t('memberAccess.memberEmail')} value={login} onChange={setLogin} type="email" autoComplete="username" /><Field label={t('memberAccess.password')} value={password} onChange={setPassword} type="password" autoComplete="current-password" /><Submit busy={busy} busyLabel={t('memberAccess.processing')}>{t('memberAccess.tabs.login')}</Submit></form> : mode === 'register' ? <form onSubmit={submitRegister} className="space-y-4"><Field label={t('memberAccess.email')} value={email} onChange={setEmail} type="email" autoComplete="email" /><Field label={t('memberAccess.nickname')} value={nickname} onChange={setNickname} autoComplete="name" /><CodeField label={t('memberAccess.emailCode')} sendLabel={t('memberAccess.sendCode')} value={code} onChange={setCode} onSend={sendCode} busy={busy} /><Field label={t('memberAccess.password')} value={password} onChange={setPassword} type="password" autoComplete="new-password" hint={t('memberAccess.passwordHint')} /><Submit busy={busy} busyLabel={t('memberAccess.processing')}>{t('memberAccess.tabs.register')}</Submit></form> : <form onSubmit={submitReset} className="space-y-4"><Field label={t('memberAccess.memberEmail')} value={email} onChange={setEmail} type="email" autoComplete="email" /><CodeField label={t('memberAccess.emailCode')} sendLabel={t('memberAccess.sendCode')} value={code} onChange={setCode} onSend={sendCode} busy={busy} /><Field label={t('memberAccess.newPassword')} value={password} onChange={setPassword} type="password" autoComplete="new-password" hint={t('memberAccess.passwordHint')} /><Submit busy={busy} busyLabel={t('memberAccess.processing')}>{t('memberAccess.resetPassword')}</Submit></form>}</div></div></div>
}

function Field({ label, value, onChange, type = 'text', autoComplete, hint }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; hint?: string }) { return <label className="block text-sm font-medium text-slate-700 dark:text-slate-200"><span>{label}</span><input required type={type} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label> }
function CodeField({ label, sendLabel, value, onChange, onSend, busy }: { label: string; sendLabel: string; value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean }) { return <label className="block text-sm font-medium text-slate-700 dark:text-slate-200"><span>{label}</span><div className="mt-1.5 flex gap-2"><input required value={value} onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" /><button type="button" disabled={busy} onClick={onSend} className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm"><Mail className="mr-1.5 inline h-4 w-4" />{sendLabel}</button></div></label> }
function Submit({ children, busy, busyLabel }: { children: React.ReactNode; busy: boolean; busyLabel: string }) { return <button type="submit" disabled={busy} className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? busyLabel : children}</button> }
