import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { emptyWorkspace, rememberOperatingWorld, type WorkspaceContext } from './workspace'

export type Role = 'client' | 'staff' | 'admin' | 'trusted_contact'

export type AccessScope = 'full' | 'provider_review'

export interface SessionUser {
  id: string
  email: string
  role: Role
  full_name: string | null
  first_name?: string | null
  last_name?: string | null
  // Provider/vendor context, mirrored from the server so the client can route
  // an under-review provider into the review shell. Absent access_scope means
  // full access.
  party_type?: 'vendor' | 'employee' | null
  network_status?: string | null
  review_stage?: string | null
  access_scope?: AccessScope
}

interface AuthState {
  user: SessionUser | null
  workspace: WorkspaceContext
  loading: boolean
  login: (email: string, password: string) => Promise<SessionUser>
  signup: (input: {
    email: string
    password: string
    first_name: string
    last_name: string
    phone?: string
    business_name?: string
    tos_accepted?: boolean
  }) => Promise<SessionUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
export const WELCOME_SESSION_KEY = 'pmv_welcome_session'

function newWelcomeSession() {
  if (typeof window === 'undefined') return
  const nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  window.sessionStorage.setItem(WELCOME_SESSION_KEY, nonce)
}

function ensureWelcomeSession() {
  if (typeof window === 'undefined') return
  if (!window.sessionStorage.getItem(WELCOME_SESSION_KEY)) newWelcomeSession()
}

function applyWorkspace(workspace?: WorkspaceContext | null) {
  const next = workspace || emptyWorkspace()
  rememberOperatingWorld(next.world, next.party_type)
  return next
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceContext>(emptyWorkspace())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: SessionUser; workspace?: WorkspaceContext }>('/me')
      setUser(data.user)
      setWorkspace(applyWorkspace(data.workspace))
      ensureWelcomeSession()
    } catch {
      setUser(null)
      setWorkspace(emptyWorkspace())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ ok: boolean; user: SessionUser }>('/auth/login', { email, password })
    newWelcomeSession()
    setUser(data.user)
    try {
      // Re-read /me so the in-memory user carries the server-derived fields the
      // login response omits (notably access_scope, which routes an under-review
      // provider into the review shell).
      const me = await api.get<{ user: SessionUser; workspace?: WorkspaceContext }>('/me')
      setUser(me.user)
      setWorkspace(applyWorkspace(me.workspace))
      return me.user
    } catch {
      setWorkspace(emptyWorkspace())
    }
    return data.user
  }, [])

  const signup = useCallback(async (input: Parameters<AuthState['signup']>[0]) => {
    const data = await api.post<{ ok: boolean; user: SessionUser }>('/auth/signup', input)
    newWelcomeSession()
    setUser(data.user)
    setWorkspace(emptyWorkspace())
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(WELCOME_SESSION_KEY)
    setUser(null)
    setWorkspace(emptyWorkspace())
  }, [])

  return (
    <AuthContext.Provider value={{ user, workspace, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}
