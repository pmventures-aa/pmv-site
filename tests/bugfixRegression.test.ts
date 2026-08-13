import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mentionLookup } from '../functions/_lib/routes/conversations'

describe('scheduled report automation host', () => {
  it('calls the Pages machine endpoint used by the other production crons', () => {
    const workflow = readFileSync('.github/workflows/scheduled-report-delivery.yml', 'utf8')
    expect(workflow).toContain('https://pmv-site.pages.dev/api/automation/reports/run')
    expect(workflow).not.toContain('https://www.pinnaclemanagementventures.com/api/automation/reports/run')

    const smoke = readFileSync('.github/workflows/automation-auth-smoke.yml', 'utf8')
    expect(smoke).toContain("check_endpoint 'Scheduled reports' '/api/automation/reports/run'")
    expect(smoke).toContain("check_endpoint 'Document envelopes' '/api/automation/document-envelopes/run'")
  })
})

describe('portal invoice schema alignment', () => {
  it('writes bill_to_json instead of columns that are not in D1', () => {
    const source = readFileSync('functions/_lib/routes/portal.ts', 'utf8')
    expect(source).toContain('bill_to_json')
    expect(source).not.toContain('tax_rate_bps')
    expect(source).not.toContain('bill_to_name')
    expect(source).not.toContain('bill_to_email')
    expect(source).not.toContain('created_by_user_id')
    expect(source).not.toContain('last_reminded_at')
  })
})

describe('field work provider roster', () => {
  it('loads providers from a staff-visible endpoint instead of manage_team employees', () => {
    const page = readFileSync('src/pages/admin/FieldWorkAdmin.tsx', 'utf8')
    expect(page).toContain('/admin/field-assignment-providers')
    expect(page).not.toContain("api.get<{ employees: StaffOption[] }>('/admin/employees')")

    const routes = readFileSync('functions/_lib/routes/fieldWork.ts', 'utf8')
    expect(routes).toContain("fieldWorkRoutes.get('/field-assignment-providers', requireStaff")
  })
})

describe('HQ client detail cache', () => {
  it('keys loaded tabs by client id and drops in-flight results after navigation', () => {
    const source = readFileSync('src/pages/admin/ClientDetailModern.tsx', 'utf8')
    expect(source).toContain('`${requestId}:${section}`')
    expect(source).toContain('activeIdRef.current !== requestId')
    expect(source).toContain('current?.account?.id === requestId')
    expect(source).toContain('loadedTabsRef.current = new Set()')
  })
})

describe('mention lookup', () => {
  it('binds a local-part LIKE clause for every mentioned handle', () => {
    const lookup = mentionLookup(['alice', 'bob'])
    expect(lookup?.sql).toBe('SELECT id FROM users WHERE LOWER(email) LIKE ? OR LOWER(email) LIKE ?')
    expect(lookup?.binds).toEqual(['alice@%', 'bob@%'])
    expect(mentionLookup([])).toBeNull()
  })
})
