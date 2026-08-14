import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  caseConversionLabel,
  isCaseConversionTarget,
  isEligibleProviderAccount,
  locationAgeLabel,
  locationFreshness,
} from '../shared/operations'

describe('operations workflow helpers', () => {
  it('supports the four safe case conversion targets', () => {
    expect(isCaseConversionTarget('matter')).toBe(true)
    expect(isCaseConversionTarget('task')).toBe(true)
    expect(isCaseConversionTarget('field_assignment')).toBe(true)
    expect(isCaseConversionTarget('quote')).toBe(true)
    expect(isCaseConversionTarget('invoice')).toBe(false)
    expect(caseConversionLabel('field_assignment')).toBe('Field job order')
  })

  it('allows active staff and admins as providers but never clients', () => {
    expect(isEligibleProviderAccount('admin', 'active')).toBe(true)
    expect(isEligibleProviderAccount('staff', 'active')).toBe(true)
    expect(isEligibleProviderAccount('client', 'active')).toBe(false)
    expect(isEligibleProviderAccount('admin', 'suspended')).toBe(false)
  })

  it('labels fresh active sharing as live and retains last-known locations', () => {
    const now = Date.parse('2026-08-14T00:00:00Z')
    expect(locationFreshness('2026-08-13 23:58:00', 1, now)).toBe('live')
    expect(locationFreshness('2026-08-13 23:58:00', 0, now)).toBe('last_known')
    expect(locationFreshness('2026-08-13 20:00:00', 1, now)).toBe('last_known')
    expect(locationFreshness(null, 1, now)).toBe('unavailable')
    expect(locationAgeLabel('2026-08-13 23:42:00', now)).toBe('Last active 18m ago')
  })
})

describe('operations workflow wiring', () => {
  it('keeps conversions linked and exposes self assignment', () => {
    const casesApi = readFileSync(new URL('../functions/_lib/routes/cases.ts', import.meta.url), 'utf8')
    const assignmentApi = readFileSync(new URL('../functions/_lib/routes/workAssignments.ts', import.meta.url), 'utf8')
    const casesUi = readFileSync(new URL('../src/pages/admin/CasesAdmin.tsx', import.meta.url), 'utf8')
    expect(casesApi).toContain("casesRoutes.post('/cases/:id/convert'")
    expect(casesApi).toContain('support_ticket_conversions')
    expect(assignmentApi).toContain('assign-self')
    expect(casesUi).toContain('Client request conversion')
    expect(casesUi).toContain('Assign to me')
  })

  it('renders a roster map and enables same-origin geolocation', () => {
    const fieldApi = readFileSync(new URL('../functions/_lib/routes/fieldWork.ts', import.meta.url), 'utf8')
    const networkUi = readFileSync(new URL('../src/pages/admin/ProviderNetworkAdmin.tsx', import.meta.url), 'utf8')
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    expect(fieldApi).toContain("fieldWorkRoutes.get('/network-map'")
    expect(fieldApi).toContain("fieldWorkRoutes.post('/location'")
    expect(networkUi).toContain('Team live and last-known map')
    expect(networkUi).toContain('Share my live location')
    expect(headers).toContain('geolocation=(self)')
    expect(headers).toContain('https://tile.openstreetmap.org')
  })
})
