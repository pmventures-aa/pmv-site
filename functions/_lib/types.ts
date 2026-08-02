export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  SESSION_SECRET: string
}

export type Role = 'client' | 'staff' | 'admin'

export interface SessionUser {
  id: string
  email: string
  role: Role
  full_name: string | null
  first_name?: string | null
  last_name?: string | null
}

export interface Vars {
  user: SessionUser
}

export interface AppEnv {
  Bindings: Env
  Variables: Vars
}
