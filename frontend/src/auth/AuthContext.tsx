import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, setUnauthorizedHandler, tokenStore } from '../api/client'
import type { UserOut } from '../api/types'

interface AuthState {
  user: UserOut | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<UserOut | null>(null)
  const [loading, setLoading] = useState(() => tokenStore.get() != null)

  const logout = useCallback(() => {
    tokenStore.set(null)
    setUser(null)
    qc.clear()
  }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    if (!tokenStore.get()) return
    api
      .get<UserOut>('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const form = new URLSearchParams({ username, password })
    const { data } = await api.post<{ access_token: string }>('/auth/login', form)
    tokenStore.set(data.access_token)
    const me = await api.get<UserOut>('/auth/me')
    setUser(me.data)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** The signed-in user; only call below RequireAuth. */
export function useMe(): UserOut {
  const { user } = useAuth()
  if (!user) throw new Error('useMe called without a signed-in user')
  return user
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="canvas" aria-busy="true" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
