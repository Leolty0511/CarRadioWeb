import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LockKeyhole, LogOut, Mail, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMemberSettings,
  memberLogin,
  registerMember,
  resetMemberPassword,
  sendMemberCode,
  type MemberRegistrationSettings,
} from '@/services/memberAuthService'

type Mode = 'login' | 'register' | 'reset'

const errorText: Record<string, string> = {
  invalid_credentials: '账号或密码不正确',
  account_pending: '账号正在等待管理员审批',
  account_rejected: '账号申请未通过',
  account_suspended: '账号已被停用',
  email_already_exists: '该邮箱已经注册',
  invalid_code: '验证码不正确',
  code_not_found_or_expired: '验证码不存在或已过期',
  invitation_required: '请输入邀请码',
  invitation_invalid: '邀请码无效、已过期或使用次数已满',
  password_too_weak: '密码至少 10 位，并包含大小写字母和数字',
  registration_closed: '当前暂未开放注册',
  smtp_not_configured: '系统尚未配置验证邮件服务',
  rate_limit: '操作过于频繁，请稍后再试',
}

export default function MemberAccess() {
  const { user, isAuthenticated, loading: sessionLoading, refresh, logout } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [settings, setSettings] = useState<MemberRegistrationSettings | null>(null)
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const returnToRaw = params.get('returnTo') || '/knowledge'
  const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/knowledge'

  useEffect(() => {
    getMemberSettings().then(setSettings).catch(() => setError('无法加载注册设置'))
  }, [])

  const run = async (action: () => Promise<Record<string, unknown>>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try { return await action() } finally { setBusy(false) }
  }

  const showError = (result: Record<string, unknown>) => {
    const key = String(result.error || '')
    setError(String(result.message || errorText[key] || '操作失败，请稍后再试'))
  }

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await run(() => memberLogin(login, password))
    if (result.success) {
      await refresh()
      navigate(returnTo, { replace: true })
    } else {showError(result)}
  }

  const sendCode = async () => {
    const purpose = mode === 'reset' ? 'reset_password' : 'register'
    const result = await run(() => sendMemberCode(email, purpose))
    if (result.success) {setMessage('验证码已发送，请检查邮箱')}
    else {showError(result)}
  }

  const submitRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await run(() => registerMember({ email, nickname, password, code, invitationCode }))
    if (result.success && result.pendingApproval) {
      setMode('login')
      setMessage('注册申请已提交，管理员审批通过后即可登录')
      setLogin(email)
      return
    }
    if (result.success) {
      await refresh()
      navigate(returnTo, { replace: true })
    } else {showError(result)}
  }

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = await run(() => resetMemberPassword(email, code, password))
    if (result.success) {
      setMode('login')
      setLogin(email)
      setMessage('密码已重置，请重新登录')
    } else {showError(result)}
  }

  if (!sessionLoading && isAuthenticated && user) {
    return (
      <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><UserRound className="h-5 w-5" /></div>
            <div><h1 className="font-semibold text-slate-900 dark:text-white">{user.nickname}</h1><p className="text-sm text-slate-500">{user.type === 'admin' ? '管理员账号' : '会员账号'}</p></div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => navigate(returnTo)} className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">继续访问</button>
            <button onClick={async () => { await logout(); setMessage('已退出登录') }} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><LogOut className="h-4 w-4" />退出</button>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionLoading && isAuthenticated) {return <Navigate to={returnTo} replace />}

  return (
    <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 text-center"><LockKeyhole className="mx-auto mb-3 h-9 w-9 text-blue-600" /><h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">资料访问</h1></div>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 grid grid-cols-3 border-b border-slate-200 dark:border-slate-700">
            {(['login', 'register', 'reset'] as Mode[]).map((item) => (
              <button key={item} type="button" onClick={() => { setMode(item); setError(''); setMessage('') }} className={`border-b-2 px-2 py-2 text-sm ${mode === item ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
                {item === 'login' ? '登录' : item === 'register' ? '注册' : '找回密码'}
              </button>
            ))}
          </div>

          {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          {message && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">{message}</div>}

          {mode === 'login' ? (
            <form onSubmit={submitLogin} className="space-y-4">
              <Field label="邮箱或管理员账号" value={login} onChange={setLogin} autoComplete="username" />
              <Field label="密码" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
              <Submit busy={busy}>登录</Submit>
            </form>
          ) : mode === 'register' ? (
            <form onSubmit={submitRegister} className="space-y-4">
              {!settings?.registrationEnabled && <p className="text-sm text-amber-600">当前暂未开放注册</p>}
              <Field label="邮箱" value={email} onChange={setEmail} type="email" autoComplete="email" />
              <Field label="昵称" value={nickname} onChange={setNickname} autoComplete="name" />
              <CodeField value={code} onChange={setCode} onSend={sendCode} busy={busy} />
              {settings?.invitationRequired && <Field label="邀请码" value={invitationCode} onChange={setInvitationCode} />}
              <Field label="密码" value={password} onChange={setPassword} type="password" autoComplete="new-password" hint="至少 10 位，包含大小写字母和数字" />
              {settings?.approvalRequired && <p className="text-xs text-slate-500">注册后需要等待管理员审批。</p>}
              <Submit busy={busy} disabled={!settings?.registrationEnabled}>提交注册</Submit>
            </form>
          ) : (
            <form onSubmit={submitReset} className="space-y-4">
              <Field label="会员邮箱" value={email} onChange={setEmail} type="email" autoComplete="email" />
              <CodeField value={code} onChange={setCode} onSend={sendCode} busy={busy} />
              <Field label="新密码" value={password} onChange={setPassword} type="password" autoComplete="new-password" hint="至少 10 位，包含大小写字母和数字" />
              <Submit busy={busy}>重置密码</Submit>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoComplete, hint }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; hint?: string }) {
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-200"><span>{label}</span><input required type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>
}

function CodeField({ value, onChange, onSend, busy }: { value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean }) {
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-200"><span>邮箱验证码</span><div className="mt-1.5 flex gap-2"><input required value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" /><button type="button" disabled={busy} onClick={onSend} className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Mail className="mr-1.5 inline h-4 w-4" />发送验证码</button></div></label>
}

function Submit({ children, busy, disabled }: { children: React.ReactNode; busy: boolean; disabled?: boolean }) {
  return <button type="submit" disabled={busy || disabled} className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? '处理中...' : children}</button>
}
