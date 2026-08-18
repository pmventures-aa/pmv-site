import { describe, expect, it } from 'vitest'
import {
  canTransition,
  cleaningStatusLabel,
  cleaningStatusTone,
  isCleaningJobStatus,
  turnoverUrgency,
  formatDuration,
  VENDOR_FIELD_STEPS,
} from '../shared/cleaningJobs'

describe('cleaning job status model', () => {
  it('labels and tones known statuses', () => {
    expect(cleaningStatusLabel('needs_review')).toBe('Needs Review')
    expect(cleaningStatusTone('completed')).toBe('success')
    expect(cleaningStatusTone('cancelled')).toBe('danger')
    expect(isCleaningJobStatus('assigned')).toBe(true)
    expect(isCleaningJobStatus('nope')).toBe(false)
  })

  it('allows the normal forward flow and blocks illegal jumps', () => {
    expect(canTransition('scheduled', 'assigned')).toBe(true)
    expect(canTransition('assigned', 'en_route')).toBe(true)
    expect(canTransition('in_progress', 'completed')).toBe(true)
    // Cannot skip from requested straight to completed.
    expect(canTransition('requested', 'completed')).toBe(false)
    // Completed and cancelled are terminal.
    expect(canTransition('completed', 'in_progress')).toBe(false)
    expect(canTransition('cancelled', 'scheduled')).toBe(false)
  })

  it('the vendor field steps chain each status to the next', () => {
    const steps = VENDOR_FIELD_STEPS
    for (const step of steps) {
      expect(canTransition(step.from, step.to)).toBe(true)
    }
    expect(steps.map((s) => s.to)).toEqual(['en_route', 'checked_in', 'in_progress', 'completed'])
  })
})

describe('turnover countdown', () => {
  const checkout = '2026-08-18T15:00:00Z' // 11:00 ET checkout
  const checkin = '2026-08-18T20:00:00Z' // 16:00 ET next check-in (5h window)

  it('reports on_track early in the window', () => {
    const now = Date.parse('2026-08-18T15:30:00Z') // 4.5h remaining
    const r = turnoverUrgency(checkout, checkin, now)
    expect(r.urgency).toBe('on_track')
    expect(r.windowMinutes).toBe(300)
    expect(r.minutesRemaining).toBe(270)
  })

  it('escalates to attention, at_risk, then late', () => {
    expect(turnoverUrgency(checkout, checkin, Date.parse('2026-08-18T18:00:00Z')).urgency).toBe('attention') // 120m
    expect(turnoverUrgency(checkout, checkin, Date.parse('2026-08-18T19:30:00Z')).urgency).toBe('at_risk') // 30m
    expect(turnoverUrgency(checkout, checkin, Date.parse('2026-08-18T20:30:00Z')).urgency).toBe('late') // -30m
  })

  it('returns none without a check-in time', () => {
    expect(turnoverUrgency(checkout, null, Date.now()).urgency).toBe('none')
  })

  it('formats durations', () => {
    expect(formatDuration(300)).toBe('5h')
    expect(formatDuration(270)).toBe('4h 30m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(-30)).toBe('-30m')
  })
})
