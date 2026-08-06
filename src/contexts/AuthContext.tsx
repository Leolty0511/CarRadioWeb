import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { getContentSession, logoutContentSession, type ContentPrincipal } from '@/services/memberAuthService'

interface AuthContextType {
  user: ContentPrincipal | null
  isAuthenticated: boolean
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
  refresh: async () => undefined,
  logout: async () => undefined,
})

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ContentPrincipal | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setUser(await getContentSession()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const logout = useCallback(async () => {
    await logoutContentSession()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    loading,
    refresh,
    logout,
  }), [loading, logout, refresh, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
export default AuthContext
