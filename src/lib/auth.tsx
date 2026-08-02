import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, ApiError } from './api'

export type Role = 'client' | 'staff' | 'admin'

export interface SessionUser {
  id: string
  email: string
  role: Role
  full_name: string | null
  first_name?: string | null
  last_name?: string | null
}

interface AuthState {
  user: SessionUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<SessionUser>
  signup: (input: {
    email: string
    password: string
    first_name: string
    last_name: string
    phone?: string
    business_name?: string
  }) => Promise<SessionUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: SessionUser }>('/me')
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ ok: boolean; user: SessionUser }>('/auth/login', { email, password })
    setUser(data.user)
    return data.user
  }, [])

  const signup = useCallback(async (input: Parameters<AuthState['signup']>[0]) => {
    const data = await api.post<{ ok: boolean; user: SessionUser }>('/auth/signup', input)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}
