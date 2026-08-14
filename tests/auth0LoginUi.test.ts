import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('client portal Auth0 UI', () => {
  it('adds Google and Microsoft controls without replacing password login', () => {
    const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
    const social = readFileSync(new URL('../src/components/auth/SocialSignIn.tsx', import.meta.url), 'utf8')
    expect(login).toContain('SocialSignIn')
    expect(login).toContain("surface === 'client'")
    expect(login).toContain('Forgot password?')
    expect(login).toContain("showPassword ? 'text' : 'password'")
    expect(social).toContain('Continue with ${connection.label}')
    expect(social).toContain('/auth/auth0/status')
    expect(social).toContain('min-h-12')
    expect(social).toContain('focus-visible:ring-4')
    expect(social).not.toContain('SSO')
    expect(social).not.toMatch(/encrypted|secure login/i)
  })

  it('keeps provider buttons hidden until Auth0 status says they are enabled', () => {
    const social = readFileSync(new URL('../src/components/auth/SocialSignIn.tsx', import.meta.url), 'utf8')
    expect(social).toContain('if (!loaded || !enabled || connections.length === 0) return null')
    expect(social).toContain('aria-disabled')
    expect(social).toContain('aria-busy')
  })

  it('exposes connect and unlink controls on the account security page', () => {
    const security = readFileSync(new URL('../src/pages/portal/Security.tsx', import.meta.url), 'utf8')
    expect(security).toContain('/auth/identities')
    expect(security).toContain('/auth/auth0/link')
    expect(security).toContain('/auth/auth0/unlink')
    expect(security).toContain('Keep at least one method')
    expect(security).toContain('Connected sign-in methods')
  })
})
