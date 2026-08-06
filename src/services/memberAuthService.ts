export interface ContentPrincipal {
  type: 'member' | 'admin'
  id: string
  nickname: string
  avatar: string
  roles: string[]
}

export interface MemberRegistrationSettings {
  registrationEnabled: boolean
  approvalRequired: boolean
  invitationRequired: boolean
}

function csrfHeader(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? { 'X-CSRF-Token': decodeURIComponent(match[1]) } : {}
}

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/member-auth${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({ success: false, error: `http_${response.status}` }))
  return { ...data, ok: response.ok }
}

export async function getMemberSettings(): Promise<MemberRegistrationSettings> {
  const result = await request('/settings')
  return result.data
}

export async function getContentSession(): Promise<ContentPrincipal | null> {
  let result = await request('/session')
  if (!result.authenticated) {
    const memberRefresh = await request('/refresh', 'POST')
    if (!memberRefresh.success) {
      await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: csrfHeader() }).catch(() => null)
    }
    result = await request('/session')
  }
  return result.authenticated ? result.data : null
}

export async function refreshMemberSession(): Promise<boolean> {
  const result = await request('/refresh', 'POST')
  return result.success === true
}

export const memberLogin = (login: string, password: string) => request('/login', 'POST', { login, password })
export const sendMemberCode = (email: string, purpose: 'register' | 'reset_password') => request('/send-code', 'POST', { email, purpose })
export const registerMember = (data: { email: string; nickname: string; password: string; code: string; invitationCode?: string }) => request('/register', 'POST', data)
export const resetMemberPassword = (email: string, code: string, password: string) => request('/reset-password', 'POST', { email, code, password })
export const logoutContentSession = () => request('/logout', 'POST')
