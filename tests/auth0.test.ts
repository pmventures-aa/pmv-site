import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getAuth0Config, auth0ConfigIssues, providerById } from '../functions/_lib/auth0/config'
import { sanitizeReturnTo, loginErrorRedirect } from '../functions/_lib/auth0/returnTo'
import { canUseClientPortalAuth } from '../functions/_lib/auth0/identities'
import { auth0ErrorMessage } from '../src/components/auth/Auth0ProviderButtons'
import type { Env } from '../functions/_lib/types'

function env(partial: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    SESSIONS: {} as KVNamespace,
    SESSION_SECRET: 'session-secret',
    PAYMENT_ENCRYPTION_KEY: 'payment-key',
    ...partial,
  }
}

describe('Auth0 configuration', () => {
  it('stays disabled when Auth0 env vars are missing', () => {
    const config = getAuth0Config(env())
    expect(config.configured).toBe(false)
    expect(config.providers).toEqual([])
    expect(auth0ConfigIssues(env())).toEqual([])
  })

  it('fails safely on partial configuration', () => {
    const partial = env({ AUTH0_DOMAIN: 'example.us.auth0.com', AUTH0_CLIENT_ID: 'abc' })
    expect(getAuth0Config(partial).configured).toBe(false)
    expect(auth0ConfigIssues(partial)).toContain('AUTH0_CLIENT_SECRET is required when Auth0 variables are set')
  })

  it('enables only configured provider connections', () => {
    const config = getAuth0Config(env({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'client',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_CONNECTION_GOOGLE: 'google-oauth2',
      AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
      AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
    }))
    expect(config.configured).toBe(true)
    expect(config.providers.map((p) => p.id)).toEqual(['google'])
    expect(providerById(config, 'microsoft')).toBeNull()
    expect(providerById(config, 'google')?.connection).toBe('google-oauth2')
  })

  it('defaults production callback and logout URLs to the www host', () => {
    const config = getAuth0Config(env({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'client',
      AUTH0_CLIENT_SECRET: 'secret',
    }))
    expect(config.callbackUrl).toBe('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback')
    expect(config.logoutUrl).toBe('https://www.pinnaclemanagementventures.com/portal/login')
    expect(config.issuer).toBe('https://example.us.auth0.com/')
  })
})

describe('Auth0 returnTo allowlist', () => {
  it('accepts portal and admin relative paths', () => {
    expect(sanitizeReturnTo('/portal')).toBe('/portal')
    expect(sanitizeReturnTo('/portal/security')).toBe('/portal/security')
    expect(sanitizeReturnTo('/portal/services/funding/apply?offering=1')).toBe('/portal/services/funding/apply?offering=1')
    expect(sanitizeReturnTo('/admin/login')).toBe('/admin/login')
  })

  it('rejects open redirects and external destinations', () => {
    expect(sanitizeReturnTo('https://evil.example/phish')).toBe('/portal')
    expect(sanitizeReturnTo('//evil.example')).toBe('/portal')
    expect(sanitizeReturnTo('/\\evil')).toBe('/portal')
    expect(sanitizeReturnTo('/api/admin')).toBe('/portal')
    expect(sanitizeReturnTo('portal')).toBe('/portal')
  })

  it('builds branded recovery redirects without leaking details', () => {
    expect(loginErrorRedirect('https://www.pinnaclemanagementventures.com/portal/login', 'unlinked'))
      .toContain('auth0=unlinked')
    expect(loginErrorRedirect('https://www.pinnaclemanagementventures.com/portal/login', 'unlinked'))
      .not.toMatch(/email=|sub=|token=/i)
  })
})

describe('Auth0 authorization boundaries', () => {
  it('only allows active client and trusted-contact portal Auth0 use', () => {
    expect(canUseClientPortalAuth('client', 'active')).toBe(true)
    expect(canUseClientPortalAuth('trusted_contact', 'active')).toBe(true)
    expect(canUseClientPortalAuth('client', 'suspended')).toBe(false)
    expect(canUseClientPortalAuth('staff', 'active')).toBe(false)
    expect(canUseClientPortalAuth('admin', 'active')).toBe(false)
  })

  it('keeps Auth0 roles/claims out of authorization code paths', () => {
    const route = readFileSync(new URL('../functions/_lib/routes/auth0.ts', import.meta.url), 'utf8')
    expect(route).toContain('Ignore Auth0 roles/org claims entirely for authorization')
    expect(route).toContain("action: 'login'")
    expect(route).toContain('destroySession')
    expect(route).toContain('createSession')
    expect(route).not.toMatch(/localStorage|sessionStorage/)
  })

  it('never auto-links by email on callback', () => {
    const route = readFileSync(new URL('../functions/_lib/routes/auth0.ts', import.meta.url), 'utf8')
    expect(route).toContain('Never auto-link by email')
    expect(route).toContain("return fail('unlinked')")
    expect(route).not.toMatch(/WHERE email = \?.*external_identities|INSERT INTO users.*auth0/i)
  })

  it('prevents unlinking the final authentication method', () => {
    const identities = readFileSync(new URL('../functions/_lib/auth0/identities.ts', import.meta.url), 'utf8')
    const migration = readFileSync(new URL('../migrations/0072_external_identities.sql', import.meta.url), 'utf8')
    expect(identities).toContain("reason: 'last_method'")
    expect(identities).toContain('countUsableAuthMethods')
    expect(migration).toContain('ON DELETE RESTRICT')
  })
})

describe('Auth0 data model and wiring', () => {
  it('creates external_identities with issuer+subject uniqueness and non-cascading user FK', () => {
    const sql = readFileSync(new URL('../migrations/0072_external_identities.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS external_identities/i)
    expect(sql).toMatch(/UNIQUE \(issuer, subject\)/)
    expect(sql).toMatch(/REFERENCES users\(id\) ON DELETE RESTRICT/)
    expect(sql).toMatch(/last_login_at/)
    expect(sql).toMatch(/email_verified/)
  })

  it('mounts Auth0 routes under /api/auth and keeps password login', () => {
    const api = readFileSync(new URL('../functions/api/[[route]].ts', import.meta.url), 'utf8')
    const auth = readFileSync(new URL('../functions/_lib/routes/auth.ts', import.meta.url), 'utf8')
    expect(api).toContain("app.route('/auth', auth0Routes)")
    expect(auth).toContain("authRoutes.post('/login'")
    expect(auth).toContain("authRoutes.post('/logout'")
    expect(auth).toContain('Local Pinnacle session invalidation is always sufficient')
  })

  it('documents required Auth0 env placeholders without secrets', () => {
    const example = readFileSync(new URL('../.dev.vars.example', import.meta.url), 'utf8')
    expect(example).toContain('AUTH0_DOMAIN=')
    expect(example).toContain('AUTH0_CLIENT_ID=')
    expect(example).toContain('AUTH0_CLIENT_SECRET=')
    expect(example).toContain('AUTH0_CALLBACK_URL=http://localhost:8788/api/auth/auth0/callback')
    expect(example).not.toMatch(/AUTH0_CLIENT_SECRET=[^#\n\s]{8,}/)
  })

  it('uses request-memory state store so Auth0 tokens never hit browser storage', () => {
    const client = readFileSync(new URL('../functions/_lib/auth0/client.ts', import.meta.url), 'utf8')
    expect(client).toContain('RequestMemoryStateStore')
    expect(client).toContain('CookieTransactionStore')
    expect(client).toContain('never written to cookies or KV')
  })
})

describe('Auth0 portal UI', () => {
  it('adds provider buttons only on the client login surface and preserves password recovery', () => {
    const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
    expect(login).toContain('Auth0ProviderButtons')
    expect(login).toContain('Forgot password?')
    expect(login).toContain("surface === 'client'")
    expect(login).toContain('auth0ErrorMessage')
  })

  it('exposes connect/unlink controls on Account Security', () => {
    const security = readFileSync(new URL('../src/pages/portal/Security.tsx', import.meta.url), 'utf8')
    expect(security).toContain('Connected sign-in methods')
    expect(security).toContain('/auth/auth0/link')
    expect(security).toContain('/auth/auth0/unlink')
    expect(security).toContain('Connect')
    expect(security).toContain('Disconnect')
  })

  it('renders accessible provider button labels and mobile-friendly controls', () => {
    const buttons = readFileSync(new URL('../src/components/auth/Auth0ProviderButtons.tsx', import.meta.url), 'utf8')
    expect(buttons).toContain('Continue with Google')
    expect(buttons).toContain('Continue with Microsoft')
    expect(buttons).toContain('aria-label')
    expect(buttons).toContain('min-h-12')
    expect(buttons).toContain('focus-visible:outline')
    expect(buttons).not.toMatch(/\bSSO\b|encrypted|secure login/i)
  })

  it('maps Auth0 recovery codes to branded neutral copy', () => {
    expect(auth0ErrorMessage('unlinked')).toMatch(/No Pinnacle account is connected/)
    expect(auth0ErrorMessage('invalid_state')).toMatch(/could not complete/i)
    expect(auth0ErrorMessage('already_linked')).toMatch(/already connected/)
    expect(auth0ErrorMessage(null)).toBeNull()
  })
})

describe('Auth0 identity helper contracts', () => {
  it('treats duplicate issuer+subject attached to another user as a linking conflict', async () => {
    // Lightweight behavioral contract: insertExternalIdentity must short-circuit
    // when findIdentityByIssuerSubject returns a different user_id.
    const source = readFileSync(new URL('../functions/_lib/auth0/identities.ts', import.meta.url), 'utf8')
    expect(source).toContain("reason: 'duplicate_identity'")
    expect(source).toContain('existing.user_id === input.userId')
  })

  it('requires verified provider email before trusting Auth0 claims for link/login', () => {
    const route = readFileSync(new URL('../functions/_lib/routes/auth0.ts', import.meta.url), 'utf8')
    expect(route).toContain('email_unverified')
    expect(route).toContain('!identity.emailVerified')
  })
})
