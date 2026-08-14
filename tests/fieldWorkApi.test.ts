import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('field-work API payload and indexes', () => {
  const fieldWork = readFileSync(new URL('../functions/_lib/routes/fieldWork.ts', import.meta.url), 'utf8')
  const vendorPage = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('lists assignments without signature image blobs', () => {
    expect(fieldWork).toContain('ASSIGNMENT_LIST_COLUMNS')
    expect(fieldWork).toContain('fa.vendor_fee_cents')
    expect(fieldWork).toContain("c.req.query('mine') === '1'")
    const listQuery = fieldWork.slice(fieldWork.indexOf('ASSIGNMENT_LIST_COLUMNS'), fieldWork.indexOf('fieldWorkRoutes.get(\'/field-assignments/:id\''))
    expect(listQuery).not.toContain('vendor_signature_image_key')
    expect(listQuery).not.toContain('SELECT fa.*')
  })

  it('lets vendors request only their own queue', () => {
    expect(vendorPage).toContain("isVendor ? '?mine=1' : ''")
    expect(fieldWork).toContain('fa.vendor_user_id = ?')
  })

  it('scopes live map agent pings instead of scanning every location row', () => {
    expect(fieldWork).toContain('loc.sharing_active = 1')
    expect(fieldWork).toContain('loc.user_id IN (')
  })
})
