export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  // Profile picture, document, brand asset, and font storage.
  UPLOADS?: R2Bucket
  SESSION_SECRET: string
  // Shared secret used only by trusted scheduled automation callers.
  AUTOMATION_CRON_SECRET1?: string
  // Encrypts ACH routing/account numbers at rest.
  PAYMENT_ENCRYPTION_KEY: string
  // Optional dedicated PKCS#8 P-256 private key (base64 DER) used to
  // cryptographically seal completed document envelopes. When absent the
  // lifecycle falls back to an HMAC server seal using SESSION_SECRET.
  DOCUMENT_SIGNING_PRIVATE_KEY?: string
  DOCUMENT_SIGNING_KEY_ID?: string
  // First-party mail transport. The relay must be operated by Pinnacle and
  // exposed on a Pinnacle-controlled hostname. Messages remain in D1 outbox
  // until the relay confirms acceptance.
  SELF_HOSTED_MAIL_RELAY_URL?: string
  SELF_HOSTED_MAIL_RELAY_SECRET?: string
  SELF_HOSTED_MAIL_FROM?: string
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
