export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  UPLOADS: R2Bucket
  SESSION_SECRET: string
  // Encrypts ACH routing/account numbers at rest (see functions/_lib/crypto.ts
  // encryptSensitive/decryptSensitive). Separate from SESSION_SECRET on purpose.
  PAYMENT_ENCRYPTION_KEY: string
  // Optional: email delivery via Resend (functions/_lib/email.ts). Unset in
  // dev/preview is fine — sendEmail no-ops and logs instead of throwing.
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
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
