import { describe, expect, it } from 'vitest'
import { getAuth0Config, auth0IssuerFromDomain, auth0DashboardUrls, findAuth0Provider } from '../functions/_lib/auth0Config'
import { sanitizeReturnTo, portalLoginErrorUrl } from '../functions/_lib/auth0ReturnTo'
import {
  canUnlinkAuthMethod,
  resolveAuth0Link,
  resolveAuth0Login,
  AUTH0_ORGANIZATIONS_DEFERRED,
} from '../functions/_lib/auth0Resolve'
import type { Env } from '../functions/_lib/types'

function env(partial: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    SESSIONS: {} as KVNamespace,
    SESSION_SECRET: 'test-session-secret-at-least-32-chars!!',
    PAYMENT_ENCRYPTION_KEY: 'test-payment-key',
    ...partial,
  }
}

describe('Auth0 configuration gating', () => {
  it('disables Auth0 when configuration is missing', () => {
    expect(getAuth0Config(env())).toBeNull()
    expect(getAuth0Config(env({ AUTH0_DOMAIN: 'tenant.auth0.com' }))).toBeNull()
  })

  it('disables Auth0 when AUTH0_ENABLED=false even if secrets exist', () => {
    expect(
      getAuth0Config(
        env({
          AUTH0_ENABLED: 'false',
          AUTH0_DOMAIN: 'tenant.auth0.com',
          AUTH0_CLIENT_ID: 'cid',
          AUTH0_CLIENT_SECRET: 'secret',
          AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
        }),
      ),
    ).toBeNull()
  })

  it('enables Auth0 with required secrets and default providers', () => {
    const config = getAuth0Config(
      env({
        AUTH0_DOMAIN: 'tenant.auth0.com',
        AUTH0_CLIENT_ID: 'cid',
        AUTH0_CLIENT_SECRET: 'secret',
        AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
      }),
    )
    expect(config).not.toBeNull()
    expect(config!.domain).toBe('tenant.auth0.com')
    expect(config!.issuer).toBe('https://tenant.auth0.com/')
    expect(config!.providers.map((p) => p.id)).toEqual(['google', 'microsoft'])
  })

  it('filters providers by AUTH0_CONNECTIONS', () => {
    const config = getAuth0Config(
      env({
        AUTH0_DOMAIN: 'tenant.auth0.com',
        AUTH0_CLIENT_ID: 'cid',
        AUTH0_CLIENT_SECRET: 'secret',
        AUTH0_CALLBACK_URL: 'http://localhost:8788/api/auth/auth0/callback',
        AUTH0_CONNECTIONS: 'google-oauth2',
      }),
    )
    expect(config!.providers).toHaveLength(1)
    expect(config!.providers[0].id).toBe('google')
    expect(findAuth0Provider(env({
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'cid',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_CALLBACK_URL: 'http://localhost:8788/api/auth/auth0/callback',
      AUTH0_CONNECTIONS: 'google-oauth2',
    }), 'microsoft')).toBeNull()
  })

  it('builds exact dashboard URL guidance', () => {
    const urls = auth0DashboardUrls()
    expect(urls.production.callbackUrl).toBe('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback')
    expect(urls.production.logoutUrl).toBe('https://www.pinnaclemanagementventures.com/portal/login')
    expect(urls.local.callbackUrl).toBe('http://localhost:8788/api/auth/auth0/callback')
  })

  it('normalizes issuer from domain', () => {
    expect(auth0IssuerFromDomain('https://tenant.auth0.com/')).toBe('https://tenant.auth0.com/')
  })
})

describe('Auth0 returnTo allowlist', () => {
  it('accepts portal-relative destinations', () => {
    expect(sanitizeReturnTo('/portal')).toBe('/portal')
    expect(sanitizeReturnTo('/portal/security')).toBe('/portal/security')
    expect(sanitizeReturnTo('/trusted')).toBe('/trusted')
  })

  it('rejects open redirects', () => {
    expect(sanitizeReturnTo('https://evil.example')).toBe('/portal')
    expect(sanitizeReturnTo('//evil.example')).toBe('/portal')
    expect(sanitizeReturnTo('/\\evil.example')).toBe('/portal')
    expect(sanitizeReturnTo('/admin')).toBe('/portal')
    expect(sanitizeReturnTo('portal')).toBe('/portal')
  })

  it('builds branded login recovery URLs without leaking internals', () => {
    const url = portalLoginErrorUrl('We could not complete sign-in.')
    expect(url.startsWith('/portal/login?')).toBe(true)
    expect(url).toContain('auth_error=')
    expect(url).not.toContain('tenant')
  })
})

describe('Auth0 identity resolution', () => {
  it('logs in an active linked client', () => {
    expect(
      resolveAuth0Login({
        identityUserId: 'u1',
        identityUserStatus: 'active',
        identityUserRole: 'client',
        providerEmail: 'a@example.com',
        emailVerified: true,
        existingEmailUserId: null,
      }),
    ).toEqual({ action: 'session', userId: 'u1' })
  })

  it('rejects disabled internal users', () => {
    expect(
      resolveAuth0Login({
        identityUserId: 'u1',
        identityUserStatus: 'suspended',
        identityUserRole: 'client',
        providerEmail: 'a@example.com',
        emailVerified: true,
        existingEmailUserId: null,
      }),
    ).toEqual({ action: 'reject', reason: 'inactive' })
  })

  it('keeps duplicate-email identities unlinked', () => {
    expect(
      resolveAuth0Login({
        identityUserId: null,
        identityUserStatus: null,
        identityUserRole: null,
        providerEmail: 'existing@example.com',
        emailVerified: true,
        existingEmailUserId: 'u-existing',
      }),
    ).toEqual({ action: 'reject', reason: 'link_required' })
  })

  it('creates a new client only for verified unknown Auth0 users', () => {
    expect(
      resolveAuth0Login({
        identityUserId: null,
        identityUserStatus: null,
        identityUserRole: null,
        providerEmail: 'new@example.com',
        emailVerified: true,
        existingEmailUserId: null,
      }),
    ).toEqual({ action: 'create_client' })

    expect(
      resolveAuth0Login({
        identityUserId: null,
        identityUserStatus: null,
        identityUserRole: null,
        providerEmail: 'new@example.com',
        emailVerified: false,
        existingEmailUserId: null,
      }),
    ).toEqual({ action: 'reject', reason: 'unverified' })
  })

  it('securely links only when both sides are verified and identity is free', () => {
    expect(
      resolveAuth0Link({
        sessionUserId: 'u1',
        intendedUserId: 'u1',
        emailVerified: true,
        providerEmail: 'a@example.com',
        existingIdentityUserId: null,
      }),
    ).toEqual({ action: 'link' })

    expect(
      resolveAuth0Link({
        sessionUserId: 'u1',
        intendedUserId: 'u1',
        emailVerified: true,
        providerEmail: 'a@example.com',
        existingIdentityUserId: 'u2',
      }),
    ).toEqual({ action: 'reject', reason: 'owned_elsewhere' })
  })

  it('prevents unlinking the final authentication method', () => {
    expect(canUnlinkAuthMethod(0, 1)).toBe(false)
    expect(canUnlinkAuthMethod(1, 0)).toBe(false)
    expect(canUnlinkAuthMethod(1, 1)).toBe(true)
    expect(canUnlinkAuthMethod(0, 2)).toBe(true)
  })

  it('defers Auth0 Organizations cleanly', () => {
    expect(AUTH0_ORGANIZATIONS_DEFERRED.status).toBe('deferred')
  })
})
