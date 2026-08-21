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
})

// The consultation set (0094-0097) built one feature across four files and
// ended in a bare ALTER TABLE ADD COLUMN. SQLite has no ADD COLUMN IF NOT
// EXISTS, so applying the schema by hand in the D1 console left the next
// `wrangler d1 migrations apply` to abort on a duplicate column partway
// through the run. 0098 restates all four steps re-runnably and the originals
// are regressed to no-ops.

describe('the consultation set is safe to re-run', () => {
  const migration = (name: string) =>
    readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')

  const superseded = [
    '0094_consultation_availability.sql',
    '0095_consultation_bookings.sql',
    '0096_client_notification_eyebrow.sql',
    '0097_consultation_meeting_format.sql',
  ]

  const rebuild = migration('0098_consultation_booking_rebuild.sql')

  // Strip comments before looking for statements: every one of these files
  // still DESCRIBES what it used to do, and the description must not be
  // mistaken for the thing itself.
  const statements = (sql: string) =>
    sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')

  it.each(superseded)('%s no longer changes the schema', (name) => {
    const body = statements(migration(name))
    expect(body).not.toMatch(/\bALTER\s+TABLE\b/i)
    expect(body).not.toMatch(/\bCREATE\s+TABLE\b/i)
    expect(body).not.toMatch(/\bUPDATE\s+\w/i)
    expect(body).not.toMatch(/\bDROP\b/i)
    // Still a valid file with a statement in it, so the migration runner has
    // something to execute and record.
    expect(body).toMatch(/SELECT 'superseded by 0098_consultation_booking_rebuild'/)
  })

  it('rebuilds every table and index conditionally', () => {
    const body = statements(rebuild)
    const creates = body.match(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?[A-Za-z_]+/gi) ?? []
    // 4 tables + 8 indexes, all conditional.
    expect(creates.length).toBe(12)
    for (const create of creates) expect(create).toMatch(/IF NOT EXISTS/i)
  })

  it('adds no column by ALTER, because that is the statement that cannot repeat', () => {
    expect(statements(rebuild)).not.toMatch(/\bALTER\s+TABLE\b/i)
    // meeting_format arrives as part of the table definition instead.
    expect(rebuild).toMatch(/meeting_format\s+TEXT/)
    expect(rebuild).toMatch(/meeting_format IS NULL OR meeting_format IN \('virtual','phone'\)/)
  })

  it('destroys nothing on a second pass', () => {
    const body = statements(rebuild)
    expect(body).not.toMatch(/\bDROP\b/i)
    expect(body).not.toMatch(/\bDELETE\s+FROM\b/i)
  })

  it('keeps the one UPDATE self-limiting, so re-running it matches no rows', () => {
    // The eyebrow correction only touches rows still carrying the seeded
    // default; after the first pass there are none left to match.
    expect(rebuild).toContain("AND eyebrow = 'Pinnacle HQ notification'")
  })

  it('still refuses to store the provider host url', () => {
    // The join url is safe to email; the start/host url is a bearer credential.
    expect(rebuild).toMatch(/meeting_url\s+TEXT/)
    expect(rebuild).not.toMatch(/start_url|host_url/)
  })
})
