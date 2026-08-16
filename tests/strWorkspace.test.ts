import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_CATEGORIES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  PAYOUT_STATUSES,
  STR_PACKAGES,
  SUPPLY_NAMES,
  SUPPLY_STOCKS,
  TURNOVER_STATUSES,
  isIssueSeverity,
  isIssueStatus,
  isIssueType,
  isPayoutStatus,
  isStrPackageKey,
  isSupplyStock,
  isTurnoverStatus,
  issueSeverityLabel,
  issueSeverityTone,
  issueStatusLabel,
  issueTypeLabel,
  money,
  payoutStatusLabel,
  strPackageLabel,
  strPackageShortLabel,
  strPlatformLabel,
  supplyStockLabel,
  supplyStockTone,
  tierForBedrooms,
  turnoverClientDescription,
  turnoverClientStatus,
  turnoverIsActive,
  turnoverReadyForVerification,
  turnoverStatusLabel,
  turnoverStatusTone,
} from '../shared/strWorkspace'
import { CALENDAR_EVENT_TYPES, calendarEventTone, calendarEventTypeLabel } from '../shared/calendarWorkspace'
import { clientWorkspace } from '../src/lib/workspace'

describe('STR packages', () => {
  it('labels the three packages consistently', () => {
    expect(STR_PACKAGES).toEqual(['guest_ready', 'guest_ready_plus', 'managed'])
    expect(strPackageLabel('guest_ready')).toBe('Guest Ready Turnover')
    expect(strPackageLabel('guest_ready_plus')).toBe('Guest Ready+')
    expect(strPackageLabel('managed')).toBe('Pinnacle Managed Turnover')
    expect(strPackageLabel(null)).toBe('Turnover service')
    expect(strPackageShortLabel('guest_ready')).toBe('Guest Ready')
    expect(strPackageShortLabel('managed')).toBe('Managed')
    expect(isStrPackageKey('guest_ready')).toBe(true)
    expect(isStrPackageKey('premium')).toBe(false)
  })
})

describe('turnover lifecycle', () => {
  it('keeps internal statuses and client-facing labels separate', () => {
    expect(TURNOVER_STATUSES).toContain('verification_needed')
    expect(turnoverStatusLabel('verification_needed')).toBe('Awaiting verification')
    expect(turnoverClientStatus('verification_needed')).toBe('Finishing Up')
    expect(turnoverClientStatus('en_route')).toBe('In Progress')
    expect(turnoverClientStatus('in_progress')).toBe('In Progress')
    expect(turnoverClientStatus('issue_reported')).toBe('Issue Flagged')
    expect(turnoverClientStatus('guest_ready')).toBe('Guest Ready')
    expect(turnoverClientStatus(null)).toBe('Scheduled')
  })

  it('never leaks raw status values into client copy', () => {
    for (const status of TURNOVER_STATUSES) {
      const client = turnoverClientStatus(status)
      expect(TURNOVER_STATUSES).not.toContain(client)
    }
  })

  it('maps statuses to descriptions that are useful, not internal', () => {
    expect(turnoverClientDescription('verification_needed')).toContain('final review')
    expect(turnoverClientDescription('guest_ready')).toContain('guest ready')
    expect(turnoverClientDescription('cancelled')).toContain('cancelled')
  })

  it('assigns tones that distinguish active vs problem vs done', () => {
    expect(turnoverStatusTone('guest_ready')).toBe('green')
    expect(turnoverStatusTone('completed')).toBe('green')
    expect(turnoverStatusTone('issue_reported')).toBe('red')
    expect(turnoverStatusTone('at_risk')).toBe('red')
    expect(turnoverStatusTone('in_progress')).toBe('gold')
    expect(turnoverStatusTone('scheduled')).toBe('blue')
    expect(turnoverStatusTone('cancelled')).toBe('slate')
  })

  it('knows which statuses keep a turnover on the active board', () => {
    expect(turnoverIsActive('scheduled')).toBe(true)
    expect(turnoverIsActive('completed')).toBe(false)
    expect(turnoverIsActive('cancelled')).toBe(false)
    expect(isTurnoverStatus('at_risk')).toBe(true)
    expect(isTurnoverStatus('mystery')).toBe(false)
  })
})

describe('issues, severities, statuses', () => {
  it('covers the issue vocabulary with guards', () => {
    expect(issueTypeLabel('damage')).toBe('Damage')
    expect(issueTypeLabel('excess_condition')).toBe('Excess condition')
    expect(issueTypeLabel('unknown')).toBe('Issue')
    expect(isIssueType('safety_concern')).toBe(true)
    expect(isIssueType('something_else')).toBe(false)
  })

  it('separates severity from status', () => {
    expect(ISSUE_SEVERITIES).toEqual(['low', 'medium', 'high', 'critical'])
    expect(issueSeverityLabel('critical')).toBe('Critical')
    expect(issueSeverityTone('high')).toBe('red')
    expect(issueSeverityTone('medium')).toBe('gold')
    expect(issueSeverityTone('low')).toBe('slate')
    expect(isIssueSeverity('high')).toBe(true)
    expect(issueStatusLabel('approved')).toBe('Approved')
    expect(issueStatusLabel(null)).toBe('Open')
    expect(isIssueStatus('resolved')).toBe(true)
    expect(ISSUE_STATUSES).toContain('declined')
  })
})

describe('supplies', () => {
  it('maps stock levels to labels and tones', () => {
    expect(SUPPLY_STOCKS).toEqual(['good', 'low', 'out'])
    expect(supplyStockLabel('out')).toBe('Out')
    expect(supplyStockLabel('low')).toBe('Low')
    expect(supplyStockLabel('good')).toBe('Good')
    expect(supplyStockTone('out')).toBe('red')
    expect(supplyStockTone('low')).toBe('gold')
    expect(supplyStockTone('good')).toBe('green')
    expect(isSupplyStock('out')).toBe(true)
    expect(isSupplyStock('plenty')).toBe(false)
  })

  it('has a concrete supply name catalog', () => {
    expect(SUPPLY_NAMES).toContain('Toilet paper')
    expect(SUPPLY_NAMES).toContain('Custom item')
  })
})

describe('checklist engine', () => {
  it('defines the category order used by the portal and provider flows', () => {
    expect(CHECKLIST_CATEGORIES[0]).toBe('Before Starting')
    expect(CHECKLIST_CATEGORIES[CHECKLIST_CATEGORIES.length - 1]).toBe('Final Walkthrough')
    expect(new Set(CHECKLIST_CATEGORIES).size).toBe(CHECKLIST_CATEGORIES.length)
  })
})

describe('provider payouts', () => {
  it('tracks a payout lifecycle separate from client billing', () => {
    expect(PAYOUT_STATUSES).toEqual(['pending', 'approved', 'paid', 'disputed'])
    expect(payoutStatusLabel('pending')).toBe('Pending')
    expect(payoutStatusLabel('paid')).toBe('Paid')
    expect(payoutStatusLabel('mystery')).toBe('Pending')
    expect(isPayoutStatus('disputed')).toBe(true)
  })
})

describe('platforms', () => {
  it('labels reservation platforms', () => {
    expect(strPlatformLabel('airbnb')).toBe('Airbnb')
    expect(strPlatformLabel('vrbo')).toBe('VRBO')
    expect(strPlatformLabel('multiple')).toBe('Multiple')
    expect(strPlatformLabel('unknown')).toBe('Other')
  })
})

describe('money helper', () => {
  it('formats cents as USD without a hardcoded pricing source', () => {
    expect(money(null)).toBe('$0')
    expect(money(undefined)).toBe('$0')
    expect(money(25000)).toBe('$250')
    expect(money(25750)).toBe('$257.50')
    expect(money(0)).toBe('$0')
  })
})

describe('tier selection', () => {
  const tiers = [
    { tier_key: '1br', tier_label: 'Up to 1 BR', max_bedrooms: 1, starting_from: 10000, client_price_cents: 15000, provider_payout_cents: 10000 },
    { tier_key: '2_3br', tier_label: '2-3 BR', max_bedrooms: 3, starting_from: 12500, client_price_cents: 18500, provider_payout_cents: 12000 },
    { tier_key: '4br', tier_label: '4 BR', max_bedrooms: 4, starting_from: 15000, client_price_cents: 22500, provider_payout_cents: 15000 },
    { tier_key: '5plus', tier_label: '5+ BR', max_bedrooms: null, starting_from: 17500, client_price_cents: 27500, provider_payout_cents: 18000 },
  ]

  it('picks the largest tier that fits, with 5+ as the catch-all', () => {
    expect(tierForBedrooms(tiers, 1)?.tier_key).toBe('1br')
    expect(tierForBedrooms(tiers, 2)?.tier_key).toBe('2_3br')
    expect(tierForBedrooms(tiers, 4)?.tier_key).toBe('4br')
    expect(tierForBedrooms(tiers, 6)?.tier_key).toBe('5plus')
    expect(tierForBedrooms(tiers, 99)?.tier_key).toBe('5plus')
  })

  it('falls back safely for unknown or empty inputs', () => {
    expect(tierForBedrooms(tiers, null)?.tier_key).toBe('1br')
    expect(tierForBedrooms(tiers, -1)?.tier_key).toBe('1br')
    expect(tierForBedrooms([], 3)).toBeNull()
  })
})

describe('guest-ready rule', () => {
  const readyGate = { requiredItems: 5, completedItems: 4, notApplicableItems: 1, missingRequiredPhotos: [], openIssuesAffectingReadiness: 0 }

  it('passes when required items are complete or N/A, photos exist, and no issue blocks readiness', () => {
    expect(turnoverReadyForVerification(readyGate)).toBe(true)
  })

  it('fails closed on a missing required item', () => {
    expect(turnoverReadyForVerification({ ...readyGate, completedItems: 3 })).toBe(false)
  })

  it('fails closed on a missing required photo', () => {
    expect(turnoverReadyForVerification({ ...readyGate, missingRequiredPhotos: ['Kitchen'] })).toBe(false)
  })

  it('fails closed on an open issue affecting guest readiness', () => {
    expect(turnoverReadyForVerification({ ...readyGate, openIssuesAffectingReadiness: 1 })).toBe(false)
  })
})

describe('STR + calendar integration', () => {
  it('registers turnover as a first-class calendar event type', () => {
    expect(CALENDAR_EVENT_TYPES).toContain('turnover')
    expect(calendarEventTypeLabel('turnover')).toBe('STR turnover')
    expect(calendarEventTone('turnover')).toBe('gold')
  })
})

describe('property-world client workspace', () => {
  it('surfaces the turnovers shortcut for STR-enrolled clients', () => {
    const copy = clientWorkspace(['str_turnover'])
    expect(copy.world).toBe('property')
    expect(copy.shortcutKeys).toContain('turnovers')
  })
})

describe('migration 0076', () => {
  const migration = readFileSync(new URL('../migrations/0076_str_turnover.sql', import.meta.url), 'utf8')

  it('defines the full data model', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS turnovers')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_property_access')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_supplies')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_reservation_calendars')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_reservations')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_checklist_templates')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_price_tiers')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS str_leads')
  })

  it('splits payout from charge instead of collapsing them', () => {
    expect(migration).toContain('provider_payout_cents')
    expect(migration).toContain('client_charge_cents')
  })

  it('seeds the automation control so the operator actually runs', () => {
    expect(migration).toContain("'str_operations'")
    expect(migration).toContain('automation_controls')
  })
})
