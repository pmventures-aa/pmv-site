export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  // Optional: profile picture and private document storage.
  UPLOADS?: R2Bucket
  SESSION_SECRET: string
  // Encrypts ACH routing/account numbers at rest.
  PAYMENT_ENCRYPTION_KEY: string
  // Optional dedicated PKCS#8 P-256 private key (base64 DER) used to
  // cryptographically seal completed document envelopes. When absent the
  // lifecycle falls back to an HMAC server seal using SESSION_SECRET.
  DOCUMENT_SIGNING_PRIVATE_KEY?: string
  DOCUMENT_SIGNING_KEY_ID?: string
  // Optional: email delivery via Resend.
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
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
