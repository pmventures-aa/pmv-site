import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('field-work list payload', () => {
  const source = readFileSync(new URL('../functions/_lib/routes/fieldWork.ts', import.meta.url), 'utf8')

  it('uses a slim list DTO instead of SELECT fa.*', () => {
    expect(source).toContain('const LIST_COLUMNS')
    expect(source).toContain('c.req.query(\'mine\') === \'1\'')
    expect(source).toContain('SELECT ${LIST_COLUMNS}')
    const listBlock = source.slice(source.indexOf('const LIST_COLUMNS'), source.indexOf("fieldWorkRoutes.get('/field-assignments'"))
    expect(listBlock).not.toContain('vendor_signature_image_key')
    expect(source).toContain('LIMIT ${limit}')
  })

  it('keeps live map agent rows to currently sharing vendors', () => {
    expect(source).toContain('loc.sharing_active = 1')
  })
})
