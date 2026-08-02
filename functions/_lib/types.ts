export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  SESSION_SECRET: string
}

export interface SessionUser {
  id: string
  email: string
  role: 'client' | 'staff' | 'admin'
  full_name: string | null
}
