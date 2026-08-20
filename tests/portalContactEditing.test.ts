import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Phase 3 of the client-portal engagement work: a client can edit their own
// name + phone; email stays read-only behind a staff-reviewed change request.
describe('client portal contact editing', () => {
  const self = read('../functions/_lib/routes/self.ts')
  const page = read('../src/pages/portal/BusinessProfile.tsx')
  const support = read('../src/pages/portal/Support.tsx')

  it('lets the client self-update name (derived first/last) and phone on the users table', () => {
    expect(self).toContain('UPDATE users SET')
    expect(self).toContain("userSets.push('full_name = ?', 'first_name = ?', 'last_name = ?')")
    expect(self).toContain("userSets.push('phone = ?', 'phone_verified = 0')")
    // GET returns contact so the form can prefill.
    expect(self).toContain('SELECT full_name, phone, email FROM users')
  })

  it('never lets email be edited here - it routes to a reviewed change request', () => {
    // Email is not in the editable users columns handled above.
    expect(self).not.toMatch(/userSets\.push\([^)]*email/)
    expect(page).toContain('Request an email change')
    expect(page).toContain('Email change request')
  })

  it('surfaces an editable contact section and keeps email read-only', () => {
    expect(page).toContain('Contact information')
    expect(page).toContain('Save contact info')
    expect(page).toContain("api.patch('/portal/profile', { full_name")
    // Refresh the session so the updated name shows across the portal.
    expect(page).toContain('await refresh()')
  })

  it('prefills the support request from the deep link', () => {
    expect(support).toContain("params.get('subject')")
    expect(support).toContain("params.get('details')")
  })
})
