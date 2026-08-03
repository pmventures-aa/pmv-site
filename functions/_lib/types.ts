export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  SESSION_SECRET: string
  // Encrypts ACH routing/account numbers at rest (see functions/_lib/crypto.ts
  // encryptSensitive/decryptSensitive). Separate from SESSION_SECRET on purpose.
  PAYMENT_ENCRYPTION_KEY: string
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
