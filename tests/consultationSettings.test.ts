import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const panel = read('../src/pages/admin/settings/ConsultationBookingSettings.tsx')
const shell = read('../src/pages/admin/SettingsAdmin.tsx')

describe('consultation booking settings', () => {
  it('is reachable as its own settings section', () => {
    expect(shell).toContain('ConsultationBookingSettings')
    expect(shell).toContain("key: 'booking'")
    expect(shell).toContain("{tab === 'booking' && <ConsultationBookingSettings />}")
  })

  it('is findable by the words someone would actually search for', () => {
    // The settings shell filters sections by these terms.
    for (const term of ['booking', 'consultation', 'availability', 'zoom', 'blackout']) {
      expect(shell).toContain(term)
    }
  })

  it('edits the weekly grid as wall-clock time, matching how it is stored', () => {
    expect(panel).toContain('formatHhMm')
    expect(panel).toContain('parseHhMm')
    expect(panel).toContain('type="time"')
    // No instant conversion in the editor; the engine handles that per day.
    expect(panel).not.toContain('zonedWallTimeToUtcMs')
  })

  it('lets a host be chosen so their calendar blocks slots', () => {
    expect(panel).toContain('hostUserId')
    expect(panel).toContain('Unassigned (staff triage)')
    expect(panel).toContain("blocks slots automatically")
  })

  it('warns before publishing a schedule with no hours', () => {
    expect(panel).toContain('publicBookable')
    expect(panel).toContain('Add a weekly window below before saving')
  })

  it('supports every knob the API exposes', () => {
    for (const field of [
      'slotMinutes', 'incrementMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes',
      'minNoticeMinutes', 'maxAdvanceDays', 'timezone', 'active',
    ]) {
      expect(panel, `settings panel is missing ${field}`).toContain(field)
    }
  })

  it('manages time off against the blackout endpoints', () => {
    expect(panel).toContain('/blackouts')
    expect(panel).toContain('/admin/availability/blackouts/')
    expect(panel).toContain('toISOString()')
  })

  it('previews what a visitor would see before publishing', () => {
    expect(panel).toContain('/preview')
    expect(panel).toContain('busyCount')
    expect(panel).toContain('Nothing is bookable')
  })

  it('carries no em dashes, which the release gate rejects in src', () => {
    expect(panel).not.toContain('—')
  })
})
