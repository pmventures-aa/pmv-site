import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Auth0 migration integrity', () => {
  it('adds external_identities with issuer+subject uniqueness and safe user FK', () => {
    const sql = readFileSync(new URL('../migrations/0072_external_identities.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS external_identities/i)
    expect(sql).toMatch(/UNIQUE\s*\(\s*issuer\s*,\s*subject\s*\)/i)
    expect(sql).toMatch(/user_id\s+TEXT NOT NULL REFERENCES users\(id\)/i)
    expect(sql).toMatch(/provider_email/i)
    expect(sql).toMatch(/email_verified/i)
    expect(sql).toMatch(/last_login_at/i)
    // Identity rows may cascade when a user is deleted, but never the reverse.
    expect(sql).not.toMatch(/REFERENCES external_identities/i)
  })
})
