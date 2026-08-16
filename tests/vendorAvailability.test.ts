import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('vendor availability toggle - API', () => {
  const routes = readFileSync(new URL('../functions/_lib/routes/employees.ts', import.meta.url), 'utf8')

  it('surfaces availability in the staff-directory feed so a vendor can read their own state', () => {
    expect(routes).toMatch(/SELECT u\.id, u\.full_name, u\.email, tm\.party_type, tm\.vendor_category, tm\.availability_status/)
  })

  it('lets a vendor flip their own availability without the manage_team grant', () => {
    expect(routes).toMatch(/hasNamedPermission\(c\.env, me, 'manage_team'\)/)
    expect(routes).toMatch(/const selfServiceVendor = isSelf && target\.party_type === 'vendor'/)
    expect(routes).toMatch(/if \(!selfServiceVendor && !\(await hasNamedPermission/)
  })

  it('restricts the self-service path to the availability field only', () => {
    expect(routes).toMatch(/DO UPDATE SET availability_status = excluded\.availability_status/)
  })

  it('still validates availability values on the self-service path', () => {
    const selfBlock = routes.split('if (selfServiceVendor)')[1] || ''
    expect(selfBlock).toMatch(/\[\'available\',\'limited\',\'unavailable\'\]/)
  })
})

describe('vendor availability toggle - HQ surface', () => {
  const source = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('reads the vendor own availability from staff-directory on mount', () => {
    expect(source).toMatch(/\/admin\/staff-directory/)
    expect(source).toMatch(/s\.id === user\.id/)
  })

  it('writes availability back through the network endpoint', () => {
    expect(source).toMatch(/\/admin\/employees\/\$\{user\.id\}\/network/)
    expect(source).toMatch(/availability_status: next/)
  })

  it('shows the toggle only to vendors and exposes the two states', () => {
    expect(source).toMatch(/workspace\.party_type === 'vendor'/)
    expect(source).toMatch(/marked available for new work/)
    expect(source).toMatch(/marked unavailable for new work/)
  })

  it('uses a real switch control (role=switch) so state is not color-only', () => {
    expect(source).toMatch(/role="switch"/)
  })
})
