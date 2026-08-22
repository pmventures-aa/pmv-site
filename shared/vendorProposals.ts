// Vendor work proposal model - shared by the server, the HQ proposal desk, and
// the provider app so status names, tones, money math, and allowed transitions
// never drift between the three.
//
// The flow this encodes, and why it has two approvals instead of one:
//
//   draft -> sent -> accepted -> released
//
// A vendor accepting a proposal is the vendor committing to the terms. It is
// deliberately NOT the moment work becomes real. Acceptance parks the proposal
// in an HQ release queue, and a second, human decision by staff turns it into a
// field_assignments row - the work order, field visit, or RON session. That
// gap is the whole point: it leaves room to confirm the client is still ready,
// the schedule still holds, and the fee is still the fee, before a provider is
// standing on someone's doorstep.

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'released'

export type ProposalTone = 'neutral' | 'info' | 'active' | 'success' | 'warn' | 'danger'

export interface ProposalStatusMeta {
  key: ProposalStatus
  label: string
  tone: ProposalTone
  /** Which desk is holding the ball. Drives the HQ queue grouping. */
  stage: 'drafting' | 'with_vendor' | 'with_hq' | 'closed'
  /** One line of plain English for the person looking at the row. */
  hint: string
}

export const PROPOSAL_STATUSES: ProposalStatusMeta[] = [
  { key: 'draft', label: 'Draft', tone: 'neutral', stage: 'drafting', hint: 'Not sent yet. Only you can see it.' },
  { key: 'sent', label: 'Awaiting Response', tone: 'info', stage: 'with_vendor', hint: 'The provider has it and has not answered.' },
  { key: 'accepted', label: 'Accepted - Needs Release', tone: 'warn', stage: 'with_hq', hint: 'The provider accepted. Release it to create the work order.' },
  { key: 'released', label: 'Released', tone: 'success', stage: 'closed', hint: 'Live work. Track it on the assignment.' },
  { key: 'declined', label: 'Declined', tone: 'danger', stage: 'closed', hint: 'The provider passed on this one.' },
  { key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', stage: 'closed', hint: 'Pulled back before the provider answered.' },
  { key: 'expired', label: 'Expired', tone: 'neutral', stage: 'closed', hint: 'The respond-by date passed without an answer.' },
]

const STATUS_BY_KEY = new Map(PROPOSAL_STATUSES.map((s) => [s.key, s]))

export function isProposalStatus(value: unknown): value is ProposalStatus {
  return typeof value === 'string' && STATUS_BY_KEY.has(value as ProposalStatus)
}

export function proposalStatusLabel(status: string): string {
  return STATUS_BY_KEY.get(status as ProposalStatus)?.label ?? status
}

export function proposalStatusTone(status: string): ProposalTone {
  return STATUS_BY_KEY.get(status as ProposalStatus)?.tone ?? 'neutral'
}

export function proposalStatusHint(status: string): string {
  return STATUS_BY_KEY.get(status as ProposalStatus)?.hint ?? ''
}

export function proposalStatusStage(status: string): ProposalStatusMeta['stage'] {
  return STATUS_BY_KEY.get(status as ProposalStatus)?.stage ?? 'closed'
}

// Allowed transitions. 'released' is reachable only from 'accepted' - there is
// no path that turns a proposal into work without the provider having said yes
// and staff having said yes after them.
const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['sent', 'withdrawn'],
  sent: ['accepted', 'declined', 'withdrawn', 'expired'],
  accepted: ['released', 'withdrawn'],
  released: [],
  declined: [],
  withdrawn: [],
  expired: [],
}

export function canTransition(from: string, to: string): boolean {
  if (!isProposalStatus(from) || !isProposalStatus(to)) return false
  return TRANSITIONS[from].includes(to)
}

/** Statuses the assigned provider is allowed to move the proposal to. */
export const VENDOR_DECISIONS = ['accepted', 'declined'] as const
export type VendorDecision = (typeof VENDOR_DECISIONS)[number]

export function isVendorDecision(value: unknown): value is VendorDecision {
  return value === 'accepted' || value === 'declined'
}

/** A proposal is editable only while nobody outside HQ has seen it. */
export function isEditable(status: string): boolean {
  return status === 'draft'
}

/** What the provider is asked to do right now, if anything. */
export function vendorNeedsToAct(status: string): boolean {
  return status === 'sent'
}

/** What HQ is holding, if anything. */
export function hqNeedsToAct(status: string): boolean {
  return status === 'accepted'
}

// ---------- Line items ----------

export interface ProposalLineInput {
  label?: string | null
  detail?: string | null
  quantity?: number | null
  unit?: string | null
  amount_cents?: number | null
}

export interface ProposalLine {
  label: string
  detail: string | null
  quantity: number | null
  unit: string | null
  amount_cents: number
}

/**
 * Normalizes whatever the compose form sent into rows worth storing. Lines with
 * no label are dropped rather than saved blank, because a proposal is a
 * document a provider reads and an unlabeled row means nothing to them.
 */
export function normalizeLines(input: unknown): ProposalLine[] {
  if (!Array.isArray(input)) return []
  const out: ProposalLine[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const line = raw as ProposalLineInput
    const label = typeof line.label === 'string' ? line.label.trim().slice(0, 200) : ''
    if (!label) continue
    const quantity = toFiniteNumber(line.quantity)
    out.push({
      label,
      detail: typeof line.detail === 'string' && line.detail.trim() ? line.detail.trim().slice(0, 2000) : null,
      quantity: quantity !== null && quantity > 0 ? quantity : null,
      unit: typeof line.unit === 'string' && line.unit.trim() ? line.unit.trim().slice(0, 40) : null,
      amount_cents: Math.max(0, Math.round(toFiniteNumber(line.amount_cents) ?? 0)),
    })
    if (out.length >= 50) break
  }
  return out
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * The offered total. Line items are the itemization; an explicit offer overrides
 * them, because staff sometimes quote a flat number and then break it down for
 * the provider's benefit rather than deriving one from the other.
 */
export function proposalTotalCents(lines: ProposalLine[], explicitOfferCents?: number | null): number {
  if (typeof explicitOfferCents === 'number' && Number.isFinite(explicitOfferCents) && explicitOfferCents > 0) {
    return Math.round(explicitOfferCents)
  }
  return lines.reduce((sum, line) => sum + (line.amount_cents || 0), 0)
}

export function formatCents(cents: number | null | undefined): string {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0
  return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * Whether a sent proposal has aged past its respond-by date. Evaluated at read
 * time rather than by a scheduled job: an expired proposal is a proposal nobody
 * answered, and there is nothing to do about it but stop showing it as live.
 */
export function isPastRespondBy(respondBy: string | null | undefined, now: Date = new Date()): boolean {
  if (!respondBy) return false
  const due = Date.parse(respondBy)
  if (!Number.isFinite(due)) return false
  return due < now.getTime()
}

/** The status to display, folding in a respond-by date that has passed. */
export function effectiveStatus(status: string, respondBy: string | null | undefined, now: Date = new Date()): string {
  if (status === 'sent' && isPastRespondBy(respondBy, now)) return 'expired'
  return status
}

// ---------- What a released proposal becomes ----------

export const PROPOSAL_KINDS = ['field', 'ron'] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

export function isProposalKind(value: unknown): value is ProposalKind {
  return value === 'field' || value === 'ron'
}

export function proposalKindLabel(kind: string): string {
  return kind === 'ron' ? 'Remote online notarization' : 'Field visit'
}
