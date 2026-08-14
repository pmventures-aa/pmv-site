import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canAccessClient } from '../functions/_lib/access'
import type { SessionUser } from '../functions/_lib/types'

describe('Auth0 does not elevate authorization', () => {
  it('ignores Auth0 roles/claims when checking client visibility', async () => {
    // Authorization remains relationship-based. A forged Auth0 "admin" claim on
    // the identity payload must never grant client B access to client A.
    const clientA: SessionUser = {
      id: 'client-a',
      email: 'a@example.com',
      role: 'client',
      full_name: 'Client A',
    }
    const fakeDb = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return null
              },
              async all() {
                return { results: [] }
              },
            }
          },
        }
      },
    } as unknown as D1Database

    const allowedSelf = await canAccessClient({ DB: fakeDb } as any, clientA, 'client-a')
    const deniedOther = await canAccessClient({ DB: fakeDb } as any, clientA, 'client-b')
    expect(allowedSelf).toBe(true)
    expect(deniedOther).toBe(false)
  })

  it('keeps password login route intact alongside Auth0 routes', () => {
    const auth = readFileSync(new URL('../functions/_lib/routes/auth.ts', import.meta.url), 'utf8')
    const auth0 = readFileSync(new URL('../functions/_lib/routes/auth0.ts', import.meta.url), 'utf8')
    expect(auth).toMatch(/authRoutes\.post\('\/login'/)
    expect(auth).toMatch(/authRoutes\.post\('\/logout'/)
    expect(auth).toMatch(/authRoutes\.post\('\/forgot-password'/)
    expect(auth0).toMatch(/auth0Routes\.get\('\/login'/)
    expect(auth0).toMatch(/auth0Routes\.get\('\/callback'/)
    expect(auth0).toMatch(/auth0Routes\.post\('\/link'/)
    expect(auth0).toMatch(/auth0Routes\.post\('\/unlink'/)
  })

  it('login page only fetches Auth0 providers for the client surface', () => {
    const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
    expect(login).toMatch(/Continue with Google|provider\.label/)
    expect(login).toMatch(/\/auth\/auth0\/providers/)
    expect(login).toMatch(/surface !== 'client'/)
    expect(login).toMatch(/aria-label=\{provider\.label\}/)
    expect(login).toMatch(/min-h-12/)
  })

  it('security page supports connect and safe unlink', () => {
    const security = readFileSync(new URL('../src/pages/portal/Security.tsx', import.meta.url), 'utf8')
    expect(security).toMatch(/Connected sign-in methods/)
    expect(security).toMatch(/\/auth\/auth0\/link/)
    expect(security).toMatch(/\/auth\/auth0\/unlink/)
    expect(security).toMatch(/can_unlink/)
  })
})
