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

  it('adds email signatures and per-user thread reads once', () => {
    const sql = readFileSync(new URL('../migrations/0065_email_signatures_and_reads.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE email_signatures/i)
    expect(sql).toMatch(/CREATE TABLE email_thread_reads/i)
    expect(sql).toMatch(/kind TEXT NOT NULL CHECK \(kind IN \('company','personal','support','custom'\)\)/)
  })
})
