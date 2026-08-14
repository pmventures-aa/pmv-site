import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('migration chain regression checks', () => {
  it('does not add users.last_seen_at twice', () => {
    const employeeMetrics = readFileSync(new URL('../migrations/0016_employee_metrics.sql', import.meta.url), 'utf8')
    const presence = readFileSync(new URL('../migrations/0048_user_presence.sql', import.meta.url), 'utf8')

    expect(employeeMetrics).toMatch(/ALTER TABLE users ADD COLUMN last_seen_at TEXT/i)
    expect(presence).not.toMatch(/ALTER TABLE users ADD COLUMN last_seen_at TEXT/i)
    expect(presence).toMatch(/CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users\(last_seen_at\)/i)
  })

  it('adds client property and matter profile columns once', () => {
    const sql = readFileSync(new URL('../migrations/0068_client_workspace_profiles.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/ALTER TABLE properties ADD COLUMN occupancy/i)
    expect(sql).toMatch(/CREATE TABLE matter_updates/i)
    expect(sql).toMatch(/ALTER TABLE matters ADD COLUMN property_id/i)
  })

  it('adds HQ letterhead email templates once', () => {
    const sql = readFileSync(new URL('../migrations/0066_hq_email_templates.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE hq_email_templates/i)
    expect(sql).toMatch(/CREATE TABLE hq_email_template_versions/i)
    expect(sql).toMatch(/slug TEXT NOT NULL UNIQUE/)
  })

  it('adds field-work list indexes without rewriting assignment rows', () => {
    const sql = readFileSync(new URL('../migrations/0074_field_work_list_indexes.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/idx_field_assignments_assigned_by/)
    expect(sql).toMatch(/idx_field_assignments_fee_market/)
    expect(sql).not.toMatch(/ALTER TABLE field_assignments/i)
  })
})
