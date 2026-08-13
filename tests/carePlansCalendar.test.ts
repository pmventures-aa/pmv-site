import { describe, expect, it } from 'vitest'
import { addMinutesIcs, buildIcs, escapeIcsText, foldIcsLine, toIcsDate } from '../shared/ics'
import { CARE_PLANS } from '../shared/carePlans'

describe('ICS calendar files', () => {
  it('formats a local datetime as an ICS stamp', () => {
    expect(toIcsDate('2026-08-13T14:30:00')).toMatch(/^20260813T143000$/)
  })

  it('adds duration without dropping the event into UTC', () => {
    expect(addMinutesIcs('2026-08-13T14:30:00', 60)).toBe('20260813T153000')
  })

  it('escapes ICS text and folds long lines', () => {
    expect(escapeIcsText('File; wait, then go')).toBe('File\\; wait\\, then go')
    const folded = foldIcsLine('A'.repeat(80))
    expect(folded.split('\r\n')[0].length).toBe(75)
  })

  it('builds a calendar Apple Calendar can import', () => {
    const ics = buildIcs([{ id: 'appt-1', title: 'Mobile notary', startsAt: '2026-08-13T14:30:00' }])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Mobile notary')
    expect(ics).toContain('UID:appt-1@pinnaclemanagementventures.com')
    expect(ics).toContain('DTSTART:20260813T143000')
    expect(ics).toContain('DTEND:20260813T153000')
  })
})

describe('care plan selling copy', () => {
  it('sells licensed property managers and on-call care together', () => {
    expect(CARE_PLANS.property.intro.toLowerCase()).toContain('licensed property managers')
    expect(CARE_PLANS.property.intro.toLowerCase()).toContain('cam agents')
    expect(CARE_PLANS.property.paths?.some((path) => path.title.toLowerCase().includes('licensed'))).toBe(true)
    expect(CARE_PLANS.property.paths?.some((path) => path.title.toLowerCase().includes('on-call'))).toBe(true)
  })

  it('gives the legal pass categories instead of one unlabeled dump', () => {
    const categories = new Set(CARE_PLANS.legal.services.map((service) => service.category))
    expect(categories.has('Notary & signing')).toBe(true)
    expect(categories.has('Courier & court')).toBe(true)
    expect(CARE_PLANS.legal.moments.length).toBeGreaterThanOrEqual(3)
  })
})
