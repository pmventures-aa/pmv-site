export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  // Optional: profile picture storage (functions/_lib/routes/uploads.ts).
  // Unset until the pmv-uploads R2 bucket is provisioned and the binding is
  // uncommented in wrangler.toml — upload routes return 503 until then
  // instead of crashing.
  UPLOADS?: R2Bucket
  SESSION_SECRET: string
  // Encrypts ACH routing/account numbers at rest (see functions/_lib/crypto.ts
  // encryptSensitive/decryptSensitive). Separate from SESSION_SECRET on purpose.
  PAYMENT_ENCRYPTION_KEY: string
  // Optional: email delivery via Resend (functions/_lib/email.ts). Unset in
  // dev/preview is fine — best-effort notifications no-op and tracked account
  // email attempts are recorded as skipped instead of breaking account actions.
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  // Signing secret for POST /api/webhooks/resend. Required only once that
  // production webhook is registered in Resend.
  RESEND_WEBHOOK_SECRET?: string
}

export type Role = 'client' | 'staff' | 'admin' | 'trusted_contact'

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
