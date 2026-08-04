/**
 * Public auth context — stub for frontend navigation filtering
 * Admin auth is handled separately via useAdminAuth hook + JWT
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react'

interface PublicUser {
  roles: string[]
}

interface AuthContextType {
  user: PublicUser | null
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
})

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Public users have no roles — all nav items without role restrictions are visible
  // value 内容恒定，memo 化以避免每次渲染新建对象导致全树重渲染
  const value = useMemo<AuthContextType>(() => ({
    user: null,
    isAuthenticated: false,
  }), [])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextType => {
  return useContext(AuthContext)
}

export default AuthContext
