export interface ContentPrincipal {
  type: 'member' | 'admin'
  id: string
  nickname: string
  avatar: string
  roles: string[]
}

export interface MemberProfile {
  id: string
  email: string
  nickname: string
  avatar: string
  createdAt?: string
}

export interface MemberFavorite {
  id: string
  documentId: string
  documentType: 'general' | 'video' | 'structured'
  title: string
  summary: string
  updatedAt: string
  createdAt: string
  url: string
}

export interface ForumMemberNotification {
  id: string
  type: string
  subjectId: string | null
  createdAt: string
  readAt: string | null
}

export interface ForumMemberSummary {
  available: boolean
  linked: boolean
  forumUserId?: string
  username?: string
  nickname?: string
  unreadCount: number
  notifications: ForumMemberNotification[]
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
  const data = await response
    .json()
    .catch(() => ({ success: false, error: `http_${response.status}` }))
  return { ...data, ok: response.ok }
}

export async function getContentSession(): Promise<ContentPrincipal | null> {
  let result = await request('/session')
  if (!result.authenticated) {
    const memberRefresh = await request('/refresh', 'POST')
    if (!memberRefresh.success) {
      await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: csrfHeader(),
      }).catch(() => null)
    }
    result = await request('/session')
  }
  return result.authenticated ? result.data : null
}

export async function refreshMemberSession(): Promise<boolean> {
  const result = await request('/refresh', 'POST')
  return result.success === true
}

export const memberLogin = (login: string, password: string) =>
  request('/login', 'POST', { login, password })
export const sendMemberCode = (email: string, purpose: 'register' | 'reset_password') =>
  request('/send-code', 'POST', { email, purpose })
export const registerMember = (data: {
  email: string
  nickname: string
  password: string
  code: string
}) => request('/register', 'POST', data)
export const resetMemberPassword = (email: string, code: string, password: string) =>
  request('/reset-password', 'POST', { email, code, password })
export const logoutContentSession = () => request('/logout', 'POST')
export const getMemberProfile = () => request('/profile')
export const getMemberForumSummary = () =>
  request('/forum-summary') as Promise<{
    success: boolean
    data?: ForumMemberSummary
    error?: string
  }>
export const updateMemberProfile = (data: { nickname: string }) => request('/profile', 'PUT', data)
export const updateMemberPassword = (currentPassword: string, newPassword: string) =>
  request('/profile/password', 'PUT', { currentPassword, newPassword })
export const getMemberFavorites = () => request('/favorites')
export const getFavoriteStatus = (documentId: string) =>
  request(`/favorites/status/${encodeURIComponent(documentId)}`)
export const addMemberFavorite = (documentId: string) =>
  request(`/favorites/${encodeURIComponent(documentId)}`, 'POST')
export const removeMemberFavorite = (documentId: string) =>
  request(`/favorites/${encodeURIComponent(documentId)}`, 'DELETE')

export async function uploadMemberAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  const response = await fetch('/api/member-auth/profile/avatar', {
    method: 'POST',
    credentials: 'include',
    body: form,
    headers: csrfHeader(),
  })
  const data = await response
    .json()
    .catch(() => ({ success: false, error: `http_${response.status}` }))
  return { ...data, ok: response.ok }
}
