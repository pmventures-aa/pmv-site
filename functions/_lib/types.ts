export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  // Optional: profile picture and private document storage.
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
  // Optional: email delivery via Resend.
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  RESEND_WEBHOOK_SECRET?: string
  // Resend receiving domain (*.resend.app). From still uses RESEND_FROM_EMAIL.
  RESEND_INBOUND_DOMAIN?: string
  // Auth0 social sign-in (optional — disabled when unset).
  AUTH0_DOMAIN?: string
  AUTH0_CLIENT_ID?: string
  AUTH0_CLIENT_SECRET?: string
  AUTH0_AUDIENCE?: string
  AUTH0_CALLBACK_URL?: string
  AUTH0_LOGOUT_URL?: string
  AUTH0_CONNECTION_GOOGLE?: string
  AUTH0_CONNECTION_MICROSOFT?: string
}

export type Role = 'client' | 'staff' | 'admin' | 'trusted_contact'

// Where a session is allowed to go. 'full' is every ordinary account
// (staff, admin, client, and already-approved vendors). 'provider_review'
// is an under-review vendor/provider admitted ONLY to their own review
// shell — closed by default everywhere else. See getUser() + the gates
// in mid.ts.
export type AccessScope = 'full' | 'provider_review'

export interface SessionUser {
  id: string
  email: string
  role: Role
  full_name: string | null
  first_name?: string | null
  last_name?: string | null
  // Provider/vendor context, derived from team_members on every request so
  // authorization never trusts a stale cookie. party_type is 'vendor' for
  // provider accounts, 'employee' for internal staff, null for clients.
  party_type?: 'vendor' | 'employee' | null
  network_status?: string | null
  review_stage?: string | null
  // Coarse capability boundary. Absent means 'full'. 'provider_review'
  // marks an under-review provider who may reach ONLY requireProvider
  // endpoints; requireUser/requireStaff/requireAdmin/etc. all reject it.
  access_scope?: AccessScope
  // Impersonation context: when set, the caller is actually the owner
  // acting AS this user via an active impersonation session. All auth
  // checks below still treat user.id as the effective user, but audit
  // paths write the owner id (impersonated_by_user_id) so nothing done
  // during impersonation looks like the target user did it themselves.
  impersonated_by_user_id?: string | null
  impersonation_session_id?: string | null
}

export interface Vars {
  user: SessionUser
}

export interface AppEnv {
  Bindings: Env
  Variables: Vars
}
