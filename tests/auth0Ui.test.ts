import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Auth0 portal UI', () => {
  const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
  const security = readFileSync(new URL('../src/pages/portal/Security.tsx', import.meta.url), 'utf8')

  it('keeps email/password and recovery while adding provider buttons', () => {
    expect(login).toContain('Welcome Back to Pinnacle')
    expect(login).toContain('Forgot password?')
    expect(login).toContain('Continue with ${connection.label}')
    expect(login).toContain('aria-label={`Continue with ${connection.label}`}')
    expect(login).toContain('min-h-12 w-full')
    expect(login).toContain('/auth/auth0/providers')
    expect(login).toContain('auth_error')
    expect(login).not.toMatch(/\bSSO\b/)
    expect(login).not.toContain('encrypted')
  })

  it('only renders provider buttons after the backend reports they are enabled', () => {
    expect(login).toContain('providers.enabled && providers.connections.length > 0')
    expect(login).toContain('disabled={!!socialBusy || busy}')
  })

  it('lets an authenticated user view, connect, and safely unlink methods', () => {
    expect(security).toContain('/auth/identities')
    expect(security).toContain('Connect ${connection.label}')
    expect(security).toContain('/auth/auth0/unlink')
    expect(security).toContain('Required sign-in method')
    expect(security).toContain('set-initial-password')
  })
})
