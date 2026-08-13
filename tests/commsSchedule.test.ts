import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('comms scheduling due-query', () => {
  it('normalizes ISO timestamps in the cron due select', () => {
    const source = readFileSync(resolve('scripts/comms-cron.mjs'), 'utf8')
    expect(source).toContain("replace(replace(substr(next_run_at, 1, 19), 'T', ' '), 'Z', '')")
    expect(source).toContain("status = ?,")
    expect(source).toContain("failed > 0 && sent > 0 ? 'partial'")
  })

  it('stores sqlite-comparable schedule timestamps in the API', () => {
    const source = readFileSync(resolve('functions/_lib/routes/comms.ts'), 'utf8')
    expect(source).toContain('toSqliteDateTime')
    expect(source).toContain("failed > 0 && sent > 0 ? 'partial'")
  })
})
