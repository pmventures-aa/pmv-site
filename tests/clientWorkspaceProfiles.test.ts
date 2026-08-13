import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { occupancyLabel, propertyCityLine, propertyDisplayName, propertyStatusLabel } from '../shared/propertyProfile'
import { matterStatusLabel, matterTypeLabel } from '../shared/matterWorkspace'

describe('property and matter workspace copy', () => {
  it('formats a property profile heading', () => {
    expect(propertyDisplayName({ name: 'Beach house', address: '1 Ocean' })).toBe('Beach house')
    expect(propertyDisplayName({ address: '1 Ocean' })).toBe('1 Ocean')
    expect(propertyCityLine({ city: 'Miami', state: 'FL', postal_code: '33101' })).toBe('Miami, FL 33101')
    expect(propertyStatusLabel('under_contract')).toBe('Under contract')
    expect(occupancyLabel('vacant')).toBe('Vacant')
  })

  it('formats matter status and type', () => {
    expect(matterStatusLabel('in_progress')).toBe('In progress')
    expect(matterTypeLabel('document_prep')).toBe('Documents')
    expect(matterTypeLabel('property_work')).toBe('Property work')
  })
})

describe('client portal profile wiring', () => {
  const app = readFileSync(new URL('../src/pages/portal/PortalApp.tsx', import.meta.url), 'utf8')
  const portal = readFileSync(new URL('../functions/_lib/routes/portal.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../migrations/0068_client_workspace_profiles.sql', import.meta.url), 'utf8')

  it('routes properties and matters to profile pages, not generic module tables', () => {
    expect(app).toContain('PropertyProfile')
    expect(app).toContain('MatterDetail')
    expect(app).toContain('property-management/:id')
    expect(app).toContain('matters/:id')
    expect(app).not.toMatch(/property-management" element=\{<ModulePage/)
    expect(app).not.toMatch(/matters" element=\{<ModulePage/)
  })

  it('exposes property and matter detail APIs plus client-visible updates', () => {
    expect(portal).toContain("portalRoutes.get('/property/:id'")
    expect(portal).toContain("portalRoutes.get('/matters/:id'")
    expect(portal).toContain("portalRoutes.post('/matters/:id/updates'")
    expect(portal).toContain('matter_updates')
    expect(portal).toContain('billingCompliance')
  })

  it('adds profile columns without storing card data', () => {
    expect(migration).toContain('ALTER TABLE properties ADD COLUMN occupancy')
    expect(migration).toContain('ALTER TABLE matters ADD COLUMN property_id')
    expect(migration).toContain('CREATE TABLE matter_updates')
    expect(migration).not.toMatch(/card_number|cvv2|primary_account/i)
  })
})
