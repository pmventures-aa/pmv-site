import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PROPOSAL_STATUSES,
  canTransition,
  effectiveStatus,
  formatCents,
  hqNeedsToAct,
  isEditable,
  isPastRespondBy,
  isProposalStatus,
  isVendorDecision,
  normalizeLines,
  proposalStatusLabel,
  proposalStatusTone,
  proposalTotalCents,
  vendorNeedsToAct,
} from '../shared/vendorProposals'

describe('the proposal status model', () => {
  it('labels and tones every status it declares', () => {
    for (const meta of PROPOSAL_STATUSES) {
      expect(isProposalStatus(meta.key)).toBe(true)
      expect(proposalStatusLabel(meta.key)).toBe(meta.label)
      expect(proposalStatusTone(meta.key)).toBe(meta.tone)
      expect(meta.hint.length).toBeGreaterThan(0)
    }
    expect(isProposalStatus('nope')).toBe(false)
    expect(proposalStatusLabel('nope')).toBe('nope')
  })

  it('walks the intended path', () => {
    expect(canTransition('draft', 'sent')).toBe(true)
    expect(canTransition('sent', 'accepted')).toBe(true)
    expect(canTransition('accepted', 'released')).toBe(true)
  })

  // The two-approval shape is the feature. Nothing may skip either half.
  it('refuses to turn a proposal into work without both approvals', () => {
    expect(canTransition('draft', 'released')).toBe(false)
    expect(canTransition('sent', 'released')).toBe(false)
    expect(canTransition('declined', 'released')).toBe(false)
    expect(canTransition('withdrawn', 'released')).toBe(false)
    expect(canTransition('expired', 'released')).toBe(false)
  })

  it('treats every closed status as terminal', () => {
    for (const status of ['released', 'declined', 'withdrawn', 'expired'] as const) {
      for (const target of PROPOSAL_STATUSES) {
        expect(canTransition(status, target.key)).toBe(false)
      }
    }
  })

  it('names which desk is holding the ball', () => {
    expect(vendorNeedsToAct('sent')).toBe(true)
    expect(vendorNeedsToAct('accepted')).toBe(false)
    expect(hqNeedsToAct('accepted')).toBe(true)
    expect(hqNeedsToAct('sent')).toBe(false)
    expect(isEditable('draft')).toBe(true)
    expect(isEditable('sent')).toBe(false)
  })

  it('only lets a provider accept or decline', () => {
    expect(isVendorDecision('accepted')).toBe(true)
    expect(isVendorDecision('declined')).toBe(true)
    expect(isVendorDecision('released')).toBe(false)
    expect(isVendorDecision('withdrawn')).toBe(false)
  })
})

describe('line items and totals', () => {
  it('keeps labeled lines and drops the rest', () => {
    const lines = normalizeLines([
      { label: 'Signing', amount_cents: 15000 },
      { label: '  ', amount_cents: 999 },
      { amount_cents: 500 },
      'not an object',
      null,
    ])
    expect(lines.map((l) => l.label)).toEqual(['Signing'])
  })

  it('normalizes quantity, unit, and amount into storable values', () => {
    const [line] = normalizeLines([{ label: 'Printing', quantity: '60', unit: ' pages ', amount_cents: '2000.4' }])
    expect(line.quantity).toBe(60)
    expect(line.unit).toBe('pages')
    expect(line.amount_cents).toBe(2000)
  })

  it('refuses negative amounts and nonsense quantities', () => {
    const [line] = normalizeLines([{ label: 'Odd', quantity: -3, amount_cents: -500 }])
    expect(line.amount_cents).toBe(0)
    expect(line.quantity).toBeNull()
  })

  it('ignores a non-array payload rather than throwing', () => {
    expect(normalizeLines(undefined)).toEqual([])
    expect(normalizeLines('items')).toEqual([])
  })

  it('sums the lines, and lets a flat offer win', () => {
    const lines = normalizeLines([{ label: 'A', amount_cents: 1000 }, { label: 'B', amount_cents: 500 }])
    expect(proposalTotalCents(lines)).toBe(1500)
    expect(proposalTotalCents(lines, 2500)).toBe(2500)
    // Zero and null both mean "no flat offer", so the lines still stand.
    expect(proposalTotalCents(lines, 0)).toBe(1500)
    expect(proposalTotalCents(lines, null)).toBe(1500)
  })

  it('formats money the way the provider will read it', () => {
    expect(formatCents(17000)).toBe('$170.00')
    expect(formatCents(null)).toBe('$0.00')
  })
})

describe('respond-by', () => {
  const now = new Date('2026-08-22T12:00:00Z')

  it('expires a sent offer once the date is behind us', () => {
    expect(isPastRespondBy('2026-08-21T12:00:00Z', now)).toBe(true)
    expect(isPastRespondBy('2026-08-23T12:00:00Z', now)).toBe(false)
    expect(isPastRespondBy(null, now)).toBe(false)
    expect(isPastRespondBy('not a date', now)).toBe(false)
  })

  // Only a live offer can go stale. An accepted one is already answered, and
  // showing it as expired would be a lie about what the provider did.
  it('only ages out an offer nobody answered', () => {
    expect(effectiveStatus('sent', '2026-08-21T12:00:00Z', now)).toBe('expired')
    expect(effectiveStatus('accepted', '2026-08-21T12:00:00Z', now)).toBe('accepted')
    expect(effectiveStatus('released', '2026-08-21T12:00:00Z', now)).toBe('released')
    expect(effectiveStatus('sent', null, now)).toBe('sent')
  })
})

describe('the proposal migration is safe to re-run', () => {
  const sql = readFileSync(new URL('../migrations/0100_vendor_work_proposals.sql', import.meta.url), 'utf8')
  const body = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')

  it('creates both tables and never alters one', () => {
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS vendor_work_proposals\b/i)
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS vendor_work_proposal_items\b/i)
    expect(body).not.toMatch(/\bALTER\s+TABLE\b/i)
  })

  it('guards every create with IF NOT EXISTS', () => {
    const creates = body.match(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?[A-Za-z_]+/gi) ?? []
    expect(creates.length).toBe(7)
    for (const statement of creates) {
      expect(statement.toUpperCase()).toContain('IF NOT EXISTS')
    }
  })

  it('indexes the queries the release queue and the provider app actually run', () => {
    expect(body).toMatch(/idx_vendor_work_proposals_vendor ON vendor_work_proposals\(vendor_user_id, status\)/i)
    expect(body).toMatch(/idx_vendor_work_proposals_status ON vendor_work_proposals\(status, created_at\)/i)
  })

  it('keeps the released assignment linked and the items owned by their proposal', () => {
    expect(body).toMatch(/field_assignment_id\s+TEXT REFERENCES field_assignments\(id\)/i)
    expect(body).toMatch(/proposal_id\s+TEXT NOT NULL REFERENCES vendor_work_proposals\(id\) ON DELETE CASCADE/i)
  })
})

describe('the two surfaces are actually reachable', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

  it('mounts the routes on the admin API', () => {
    const api = read('functions/api/[[route]].ts')
    expect(api).toContain("import { vendorProposalRoutes } from '../_lib/routes/vendorProposals'")
    expect(api).toContain("app.route('/admin', vendorProposalRoutes)")
  })

  it('gives HQ a Work Proposals destination and providers a Work offers one', () => {
    const nav = read('src/components/layout/nav.ts')
    expect(nav).toMatch(/key:'work-proposals',label:'Work Proposals',to:'work-proposals'/)
    expect(nav).toMatch(/key:'work-offers',label:'Work offers',to:'work-offers'/)
    // The HQ entry sits in Delivery, next to the assignments a release becomes.
    expect(nav).toMatch(/key:'work-proposals'[^}]*section:'Delivery'/)
  })

  it('routes both list and detail on each side, and lets staff see the HQ tab', () => {
    const app = read('src/pages/admin/AdminApp.tsx')
    for (const path of ['work-proposals', 'work-proposals/:id', 'work-offers', 'work-offers/:id']) {
      expect(app).toContain(`<Route path="${path}"`)
    }
    expect(app).toContain("'work-proposals'")
  })

  it('never puts a release control on the provider page', () => {
    const vendorPage = read('src/pages/admin/WorkOffersVendor.tsx')
    expect(vendorPage).toContain('/respond')
    expect(vendorPage).toContain("decision: 'accepted'")
    expect(vendorPage).not.toMatch(/\/release\b/)
  })

  it('never puts an accept control on the HQ page', () => {
    const hqPage = read('src/pages/admin/WorkProposalsAdmin.tsx')
    expect(hqPage).toContain("act('release'")
    expect(hqPage).toContain("act('send'")
    expect(hqPage).not.toMatch(/\/respond\b/)
    expect(hqPage).not.toContain('decision')
  })
})
