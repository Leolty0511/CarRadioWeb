/**
 * Admin login page
 * Email verification + password login (OAuth removed)
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, AlertCircle, Mail, Lock, User, Loader2, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { acceptInvitation, getBootstrapStatus, getInvitation, sendVerificationCode, verifyCode as verifyCodeApi, emailLogin, emailRegister, resetPassword } from '@/services/authService'

interface AdminAuthProps {
  onAuthenticated: () => void
}

const MIN_PASSWORD_LENGTH = 10

type AuthStep = 'login' | 'register' | 'forgot-email' | 'forgot-verify' | 'forgot-password' | 'accept-invitation'

const AdminAuth: React.FC<AdminAuthProps> = ({ onAuthenticated }) => {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<AuthStep>('login')

  // Form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [bootstrapChecked, setBootstrapChecked] = useState(false)
  const [bootstrapError, setBootstrapError] = useState(false)
  const [hasInvitation, setHasInvitation] = useState(false)
  const [invitationToken, setInvitationToken] = useState('')
  const [invitationEmail, setInvitationEmail] = useState('')

  const loadBootstrapStatus = async (invite = '') => {
    setBootstrapError(false)
    const result = await getBootstrapStatus()
    if (result.success) {
      setNeedsBootstrap(result.needsBootstrap)
      if (result.needsBootstrap && !invite) {
        setStep('register')
      }
    } else {
      setBootstrapError(true)
    }
    setBootstrapChecked(true)
  }

  useEffect(() => {
    let cancelled = false
    const invite = new URLSearchParams(window.location.search).get('invite') || ''
    setHasInvitation(!!invite)
    if (invite) {
      setLoading(true)
      getInvitation(invite).then(result => {
        if (cancelled) {return}
        if (result.success && result.invitation) {
          setInvitationToken(invite)
          setInvitationEmail(result.invitation.email)
          setEmail(result.invitation.email)
          setNickname(result.invitation.nickname)
          setStep('accept-invitation')
        } else {
          setError(t(`adminAuth.errors.${result.error || 'unknown'}`, t('adminAuth.invalidInvitation')))
        }
      }).finally(() => {
        if (!cancelled) {setLoading(false)}
      })
    }
    loadBootstrapStatus(invite).then(() => {
      if (cancelled) {return}
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const handleSendCode = async () => {
    setError(null)

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('adminAuth.invalidEmail'))
      return
    }

    setLoading(true)
    try {
      const result = await sendVerificationCode(email, 'reset_password')

      if (result.success) {
        setCooldown(60) // 60 second cooldown
        // Move to verify step
        setStep('forgot-verify')
      } else {
        const errorKey = result.error || 'unknown'
        setError(t(`adminAuth.errors.${errorKey}`, t('adminAuth.sendCodeFailed')))
        if (result.remainingMs) {
          setCooldown(Math.ceil(result.remainingMs / 1000))
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setError(null)

    if (!verifyCode.trim() || verifyCode.trim().length !== 6) {
      setError(t('adminAuth.invalidCode'))
      return
    }

    setLoading(true)
    try {
      const result = await verifyCodeApi(email, verifyCode, 'reset_password')

      if (result.success) {
        setStep('forgot-password')
      } else {
        const errorKey = result.error || 'unknown'
        setError(t(`adminAuth.errors.${errorKey}`, t('adminAuth.verifyFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setError(null)

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('adminAuth.invalidEmail'))
      return
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('adminAuth.passwordTooShort'))
      return
    }

    // Password complexity check
    const hasUppercase = /[A-Z]/.test(password)
    const hasLowercase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)

    if (!hasUppercase || !hasLowercase || !hasNumber) {
      setError(t('adminAuth.passwordTooWeak'))
      return
    }

    setLoading(true)
    try {
      const result = await emailRegister(email, password, nickname || undefined)

      if (result.success) {
        onAuthenticated()
      } else if (result.error === 'account_pending_approval') {
        setError(t('adminAuth.accountPendingApproval'))
      } else {
        const errorKey = result.error || 'unknown'
        setError(t(`adminAuth.errors.${errorKey}`, t('adminAuth.registerFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('adminAuth.passwordTooShort'))
      return
    }

    setLoading(true)
    try {
      const result = await resetPassword(email, verifyCode, password)

      if (result.success) {
        setStep('login')
        setError(null)
        // Show success message briefly
      } else {
        const errorKey = result.error || 'unknown'
        setError(t(`adminAuth.errors.${errorKey}`, t('adminAuth.resetPasswordFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvitation = async () => {
    setError(null)

    if (!invitationToken) {
      setError(t('adminAuth.invalidInvitation'))
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('adminAuth.passwordTooShort'))
      return
    }

    const hasUppercase = /[A-Z]/.test(password)
    const hasLowercase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      setError(t('adminAuth.passwordTooWeak'))
      return
    }

    setLoading(true)
    try {
      const result = await acceptInvitation(invitationToken, password, nickname || undefined)
      if (result.success) {
        onAuthenticated()
      } else {
        const errorKey = result.error || 'unknown'
        setError(t(`adminAuth.errors.${errorKey}`, t('adminAuth.acceptInvitationFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError(t('adminAuth.loginIdRequired'))
      return
    }
    if (!password) {
      setError(t('adminAuth.passwordRequired'))
      return
    }

    setLoading(true)
    try {
      const result = await emailLogin(email, password)

      if (result.success) {
        onAuthenticated()
      } else {
        const errorKey = result.error || 'unknown'
        setError(t(`adminAuth.errors.${errorKey}`, t('adminAuth.loginFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    setError(null)
    setVerifyCode('')
    setPassword('')
    if (needsBootstrap && !hasInvitation) {
      setStep('register')
      return
    }
    if (step === 'register' || step === 'forgot-email') {
      setStep('login')
    } else if (step === 'forgot-verify') {
      setStep('forgot-email')
    } else if (step === 'forgot-password') {
      setStep('forgot-verify')
    }
  }

  const renderStepContent = () => {
    switch (step) {
      case 'login':
        if (!bootstrapChecked) {
          return (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('adminAuth.checkingBootstrap')}
            </div>
          )
        }

        if (bootstrapError) {
          return (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300 text-sm p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{t('adminAuth.bootstrapCheckFailed')}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBootstrapChecked(false)
                  loadBootstrapStatus()
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 transition-colors"
              >
                {t('adminAuth.retryBootstrapCheck')}
              </button>
            </div>
          )
        }

        return (
          <>
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('adminAuth.loginIdPlaceholder')}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('adminAuth.passwordPlaceholder')}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('adminAuth.loginButton')}
              </button>
            </form>

            <div className="flex justify-between text-center pt-2 text-xs">
              <button
                type="button"
                onClick={() => { setStep('forgot-email'); setError(null); }}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                {t('adminAuth.forgotPassword')}
              </button>
              {needsBootstrap && (
                <button
                  type="button"
                  onClick={() => { setStep('register'); setError(null); }}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  {t('adminAuth.noAccount')}
                </button>
              )}
            </div>
          </>
        )

      case 'register':
        return (
          <div className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('adminAuth.emailPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                autoComplete="email"
                required
              />
            </div>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('adminAuth.nicknamePlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                autoComplete="name"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('adminAuth.passwordPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                autoComplete="new-password"
                required
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('adminAuth.passwordHint')}
            </p>

            <button
              type="button"
              onClick={handleRegister}
              disabled={loading || password.length < MIN_PASSWORD_LENGTH}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminAuth.registerButton')}
            </button>

            {!needsBootstrap && (
              <button
                type="button"
                onClick={goBack}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-400 text-sm hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('adminAuth.back')}
              </button>
            )}
          </div>
        )

      case 'forgot-email':
        return (
          <div className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('adminAuth.emailPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                required
              />
            </div>

            <button
              type="button"
              onClick={handleSendCode}
              disabled={loading || cooldown > 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {cooldown > 0 ? t('adminAuth.resendIn', { seconds: cooldown }) : t('adminAuth.sendCode')}
            </button>

            <button
              type="button"
              onClick={goBack}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-400 text-sm hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('adminAuth.backToLogin')}
            </button>
          </div>
        )

      case 'forgot-verify':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              {t('adminAuth.codeSentTo', { email })}
            </p>

            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('adminAuth.codePlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow text-center text-2xl tracking-widest"
              maxLength={6}
              required
            />

            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={loading || verifyCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminAuth.verifyButton')}
            </button>

            <div className="flex justify-between text-center text-xs">
              <button
                type="button"
                onClick={goBack}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                <ArrowLeft className="h-3 w-3 inline mr-1" />
                {t('adminAuth.back')}
              </button>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={cooldown > 0}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
              >
                {cooldown > 0 ? t('adminAuth.resendIn', { seconds: cooldown }) : t('adminAuth.resendCode')}
              </button>
            </div>
          </div>
        )

      case 'accept-invitation':
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              {invitationEmail}
            </p>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('adminAuth.nicknamePlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                autoComplete="name"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('adminAuth.passwordPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                autoComplete="new-password"
                required
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('adminAuth.passwordHint')}
            </p>

            <button
              type="button"
              onClick={handleAcceptInvitation}
              disabled={loading || password.length < MIN_PASSWORD_LENGTH}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminAuth.acceptInvitationButton')}
            </button>
          </div>
        )

      case 'forgot-password':
        return (
          <div className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('adminAuth.newPasswordPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                autoComplete="new-password"
                required
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('adminAuth.passwordHint')}
            </p>

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading || password.length < MIN_PASSWORD_LENGTH}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminAuth.resetPasswordButton')}
            </button>

            <button
              type="button"
              onClick={goBack}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-slate-600 dark:text-slate-400 text-sm hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('adminAuth.back')}
            </button>
          </div>
        )
    }
  }

  const getStepTitle = () => {
    switch (step) {
      case 'login':
        return t('adminAuth.login')
      case 'register':
        return t('adminAuth.register')
      case 'forgot-email':
      case 'forgot-verify':
      case 'forgot-password':
        return t('adminAuth.resetPassword')
      case 'accept-invitation':
        return t('adminAuth.acceptInvitation')
    }
  }

  const getStepDescription = () => {
    switch (step) {
      case 'login':
        return t('adminAuth.loginHint')
      case 'register':
        return t('adminAuth.registerPasswordHint')
      case 'forgot-email':
        return t('adminAuth.forgotEmailHint')
      case 'forgot-verify':
        return t('adminAuth.forgotVerifyHint')
      case 'forgot-password':
        return t('adminAuth.forgotPasswordHint')
      case 'accept-invitation':
        return t('adminAuth.acceptInvitationHint')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-6 w-6 text-white dark:text-slate-900" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('adminAuth.title')}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t('adminAuth.subtitle')}
          </p>
        </div>

        <Card className="shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg">{getStepTitle()}</CardTitle>
            <CardDescription>{getStepDescription()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {error && (
              <div
                className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {renderStepContent()}
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t('adminAuth.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default AdminAuth
