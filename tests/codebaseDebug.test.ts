import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ApiError, readApiPayload } from '../src/lib/api'
import { readComposeQuery, stripComposeQuery } from '../src/lib/emailComposeQuery'

describe('email compose deep links', () => {
  it('reads a Network Email link and can seed compose again after the query is cleared', () => {
    const first = readComposeQuery(new URLSearchParams('tab=email&compose=1&to=ada%40x.com&name=Ada'))
    expect(first).toEqual({ to: 'ada@x.com', name: 'Ada', clientId: null, inquiryId: null })
    const cleared = stripComposeQuery(new URLSearchParams('tab=email&compose=1&to=ada@x.com&name=Ada&thread=t1'))
    expect(cleared.get('compose')).toBeNull()
    expect(cleared.get('tab')).toBe('email')
    expect(cleared.get('thread')).toBe('t1')
    expect(readComposeQuery(cleared)).toBeNull()
    const second = readComposeQuery(new URLSearchParams('tab=email&compose=1&to=bea%40x.com&name=Bea'))
    expect(second?.to).toBe('bea@x.com')
  })
})

describe('debug regressions', () => {
  it('proxies Vite /api calls to wrangler so the frontend terminal can load data', () => {
    const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
    expect(vite).toContain("target: 'http://127.0.0.1:8788'")
    expect(vite).toContain("'/api'")
    expect(vite).toContain('writeHead(502')
  })

  it('lets Field Work load providers without manage_team', () => {
    const field = readFileSync(new URL('../src/pages/admin/FieldWorkAdmin.tsx', import.meta.url), 'utf8')
    const employees = readFileSync(new URL('../functions/_lib/routes/employees.ts', import.meta.url), 'utf8')
    expect(field).toContain('/admin/staff-directory')
    expect(field).not.toContain('/admin/employees')
    expect(employees).toContain('tm.party_type')
    expect(employees).toContain('ON CONFLICT(user_id) DO UPDATE SET')
  })

  it('rejects Vite SPA HTML so a missing API is not treated as a logged-out session', () => {
    expect(() => readApiPayload({ ok: true, status: 200, contentType: 'text/html; charset=utf-8' }, null)).toThrow(ApiError)
    expect(readApiPayload({ ok: true, status: 200, contentType: 'application/json' }, { user: { id: 'u1' } })).toEqual({ user: { id: 'u1' } })
    try {
      readApiPayload({ ok: false, status: 403, contentType: 'application/json' }, { error: 'forbidden' })
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(403)
      expect((err as ApiError).message).toBe('forbidden')
    }
  })

  it('runs scheduled reports on the same Pages host as the other automations', () => {
    const reports = readFileSync(new URL('../.github/workflows/scheduled-report-delivery.yml', import.meta.url), 'utf8')
    const smoke = readFileSync(new URL('../.github/workflows/automation-auth-smoke.yml', import.meta.url), 'utf8')
    expect(reports).toContain('https://pmv-site.pages.dev/api/automation/reports/run')
    expect(reports).not.toContain('www.pinnaclemanagementventures.com/api/automation/reports/run')
    expect(smoke).toContain('/api/automation/reports/run')
  })
})
