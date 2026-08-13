import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('portal calendar listScoped ordering', () => {
  it('orders appointments by starts_at without a second ORDER BY clause', () => {
    const source = readFileSync(new URL('../functions/_lib/routes/portal.ts', import.meta.url), 'utf8')
    expect(source).toContain("listScoped(c, 'appointments', '', 'starts_at ASC')")
    expect(source).not.toMatch(/listScoped\(c,\s*'appointments',\s*'ORDER BY/)
    expect(source).toMatch(/async function listScoped\([\s\S]*orderBy = 'created_at DESC'/)
  })
})
