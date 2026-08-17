import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-shape tests for the field-location retention automation.
// End-to-end pruning behavior is exercised in preview D1 - these
// tests pin the policy-shaped decisions the spec calls out so a
// future refactor cannot silently regress retention.

describe('field-location retention runner', () => {
  const source = readFileSync(new URL('../functions/_lib/fieldLocationRetention.ts', import.meta.url), 'utf8')

  it('never deletes from field_location_sessions - only field_location_points', () => {
    // The spec is explicit: preserve durable assignment milestones
    // (start_lat, last_lat, ended_reason, timestamps) so an operator
    // can reconstruct an old field visit even after the raw stream is
    // gone. The runner may only prune the points table.
    expect(source).toContain('DELETE FROM field_location_points')
    expect(source).not.toContain('DELETE FROM field_location_sessions')
    expect(source).not.toContain('UPDATE field_location_sessions')
  })

  it('defaults to a 90-day retention window and clamps overrides to a safe range', () => {
    expect(source).toContain('DEFAULT_RETENTION_DAYS = 90')
    expect(source).toContain('MIN_RETENTION_DAYS = 7')
    expect(source).toContain('MAX_RETENTION_DAYS = 365 * 5')
  })

  it('caps the per-run delete count so a single run cannot lock D1 on a large backlog', () => {
    expect(source).toContain('DEFAULT_MAX_PER_RUN = 5000')
    expect(source).toContain('LIMIT ?')
  })

  it('reads per-firm overrides from automation_controls.config_json', () => {
    expect(source).toContain("automation_key = 'field_location_retention'")
    expect(source).toContain('config_json')
  })

  it('reports a remaining-backlog estimate so the automation dashboard can pace', () => {
    expect(source).toContain('remaining_estimate')
    expect(source).toContain('COUNT(*) AS n FROM field_location_points')
  })
})

describe('field-location retention wiring', () => {
  const source = readFileSync(new URL('../functions/_lib/routes/relationshipAutomation.ts', import.meta.url), 'utf8')

  it('is registered in AUTOMATIONS with a daily cadence', () => {
    expect(source).toContain('field_location_retention:')
    expect(source).toContain("cadence: 'Daily at 03:15 AM ET'")
    expect(source).toContain('intervalMinutes: 1440')
  })

  it('routes into runFieldLocationRetention from executeAutomation', () => {
    expect(source).toContain("import { runFieldLocationRetention } from '../fieldLocationRetention'")
    expect(source).toContain("key === 'field_location_retention'")
    expect(source).toContain('await runFieldLocationRetention(c.env)')
  })

  it('exposes a cron trigger endpoint gated by the shared AUTOMATION_CRON_SECRET1', () => {
    expect(source).toContain("relationshipAutomationRoutes.post('/automation/field-location-retention/run', requireAutomationCron")
  })

  it('advertises a next run time on the automation dashboard', () => {
    expect(source).toContain("key==='field_location_retention'")
    expect(source).toContain('nextDailyEastern(3,15)')
  })
})
