/**
 * Lightweight auth check utility — uses a module-level cache
 * to avoid hammering the server on every call.
 * Cache is invalidated whenever a fetch fails (session likely expired).
 */

import { refreshSession } from './authService'

let cachedAuthenticated: boolean | null = null

export function isAuthenticated(): boolean {
  return cachedAuthenticated ?? false
}

export function invalidateAuthCache(): void {
  cachedAuthenticated = null
}

export async function checkAdminAuth(): Promise<boolean> {
  try {
    let response = await fetch('/api/auth/check', { credentials: 'include' })
    if (!response.ok) {
      cachedAuthenticated = false
      return false
    }
    let data = await response.json()
    if (!data.authenticated && await refreshSession()) {
      response = await fetch('/api/auth/check', { credentials: 'include' })
      if (!response.ok) {
        cachedAuthenticated = false
        return false
      }
      data = await response.json()
    }
    cachedAuthenticated = !!data.authenticated
    return cachedAuthenticated
  } catch {
    cachedAuthenticated = false
    return false
  }
}
