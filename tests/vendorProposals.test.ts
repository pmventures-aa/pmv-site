import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env, SessionUser } from '../functions/_lib/types'

// The caller identity is the whole subject of half these tests, so the gate is
// swapped for one that admits whoever `currentUser` is at the time.
let currentUser: SessionUser
vi.mock('../functions/_lib/mid', () => ({
  requireStaff: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', currentUser)
    await next()
  },
}))

const sent: Array<{ to: string; subject: string; text: string }> = []
vi.mock('../functions/_lib/email', () => ({
  escapeHtml: (s: string) => s,
  sendEmail: vi.fn(async (_env: Env, o: { to: string; subject: string; text?: string }) => {
    sent.push({ to: o.to, subject: o.subject, text: o.text ?? '' })
  }),
}))

const audits: Array<{ action: string }> = []
vi.mock('../functions/_lib/auditLog', () => ({
  logAudit: vi.fn(async (_env: Env, e: { action: string }) => { audits.push({ action: e.action }) }),
  actorIp: () => null,
  actorUserAgent: () => null,
  actorGeo: () => null,
}))

const activity: Array<{ kind: string }> = []
vi.mock('../functions/_lib/activity', () => ({
  logActivity: vi.fn(async (_env: Env, e: { kind: string }) => { activity.push({ kind: e.kind }) }),
}))

vi.mock('../functions/_lib/scope', () => ({ canAccessClient: async () => true }))
vi.mock('../functions/_lib/fieldProviders', () => ({ resolveEligibleFieldProvider: async (_env: Env, id: string) => id }))

let idCounter = 0
vi.mock('../functions/_lib/crypto', () => ({ uuid: () => `id-${++idCounter}` }))

import { vendorProposalRoutes } from '../functions/_lib/routes/vendorProposals'

type Row = Record<string, unknown>

interface Store {
  proposals: Row[]
  items: Row[]
  assignments: Row[]
  users: Array<{ id: string; email: string; full_name: string | null }>
}

let store: Store

const STAFF: SessionUser = { id: 'staff-1', email: 'ops@pmv.test', role: 'staff', full_name: 'Ops', party_type: 'employee' }
const ADMIN: SessionUser = { id: 'admin-1', email: 'boss@pmv.test', role: 'admin', full_name: 'Boss', party_type: 'employee' }
const VENDOR: SessionUser = { id: 'vendor-1', email: 'notary@pmv.test', role: 'staff', full_name: 'Nora', party_type: 'vendor' }
const OTHER_VENDOR: SessionUser = { id: 'vendor-2', email: 'other@pmv.test', role: 'staff', full_name: 'Otto', party_type: 'vendor' }

function totalFor(proposal: Row): number {
  const offer = Number(proposal.offer_cents) || 0
  if (offer > 0) return offer
  return store.items
    .filter((i) => i.proposal_id === proposal.id)
    .reduce((sum, i) => sum + (Number(i.amount_cents) || 0), 0)
}

function decorate(proposal: Row): Row {
  const client = store.users.find((u) => u.id === proposal.client_user_id)
  const vendor = store.users.find((u) => u.id === proposal.vendor_user_id)
  return {
    ...proposal,
    total_cents: totalFor(proposal),
    client_name: client?.full_name ?? null,
    client_email: client?.email ?? null,
    vendor_name: vendor?.full_name ?? null,
    vendor_email: vendor?.email ?? null,
  }
}

// A stand-in for D1 that models only the statements these routes issue. It is
// deliberately shape-matched rather than a SQL engine: a statement this file
// does not know about throws, so a route that starts issuing new SQL fails
// loudly here instead of silently passing against a permissive fake.
function makeEnv(): Env {
  const prepare = (sql: string) => {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ')
    let bound: unknown[] = []
    const api = {
      bind(...args: unknown[]) { bound = args; return api },
      async run() { return apply() },
      async first<T>(): Promise<T | null> {
        if (s.includes('from vendor_work_proposals p') && s.includes('where p.id = ?')) {
          const hit = store.proposals.find((p) => p.id === bound[0])
          return (hit ? decorate(hit) : null) as T | null
        }
        if (s.includes('select email, full_name from users where id')) {
          const hit = store.users.find((u) => u.id === bound[0])
          return (hit ? { email: hit.email, full_name: hit.full_name } : null) as T | null
        }
        throw new Error(`unhandled first SQL: ${sql}`)
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (s.includes('from vendor_work_proposal_items where proposal_id')) {
          return { results: store.items.filter((i) => i.proposal_id === bound[0]) as T[] }
        }
        if (s.includes('from vendor_work_proposals p')) {
          let rows = store.proposals
          if (s.includes('p.vendor_user_id = ?') && !s.includes('or p.vendor_user_id')) {
            rows = rows.filter((p) => p.vendor_user_id === bound[0])
          }
          if (s.includes("p.status <> 'draft'")) rows = rows.filter((p) => p.status !== 'draft')
          if (s.includes('p.created_by_user_id = ? or p.vendor_user_id = ?')) {
            rows = rows.filter((p) => p.created_by_user_id === bound[0] || p.vendor_user_id === bound[1])
          }
          return { results: rows.map(decorate) as T[] }
        }
        throw new Error(`unhandled all SQL: ${sql}`)
      },
    }
    function apply() {
      if (s.startsWith('insert into vendor_work_proposals')) {
        const [id, kind, service_key, client_user_id, vendor_user_id, created_by_user_id, title, summary,
          site_label, site_address, site_city, site_state, site_postal_code,
          scheduled_at, window_start, window_end, respond_by, offer_cents, offer_notes] = bound
        store.proposals.push({
          id, kind, service_key, client_user_id, vendor_user_id, created_by_user_id, title, summary,
          site_label, site_address, site_city, site_state, site_postal_code,
          scheduled_at, window_start, window_end, respond_by, offer_cents, offer_notes,
          status: 'draft', sent_at: null, responded_at: null, vendor_response_note: null,
          released_at: null, released_by_user_id: null, field_assignment_id: null,
          withdrawn_at: null, withdraw_reason: null, created_at: '2026-08-22', updated_at: '2026-08-22',
        })
        return { success: true }
      }
      if (s.startsWith('delete from vendor_work_proposal_items')) {
        store.items = store.items.filter((i) => i.proposal_id !== bound[0])
        return { success: true }
      }
      if (s.startsWith('insert into vendor_work_proposal_items')) {
        const [id, proposal_id, position, label, detail, quantity, unit, amount_cents] = bound
        store.items.push({ id, proposal_id, position, label, detail, quantity, unit, amount_cents })
        return { success: true }
      }
      if (s.startsWith('insert into field_assignments')) {
        const [id, kind, service_key, client_user_id, vendor_user_id, assigned_by_user_id, title] = bound
        // vendor_fee_adjustment_cents is a literal 0 in the statement, so the
        // bound positions are base=14, fee=15, reason=16.
        store.assignments.push({
          id, kind, service_key, client_user_id, vendor_user_id, assigned_by_user_id, title,
          scheduled_at: bound[12], notes: bound[13], fee_base: bound[14], fee: bound[15], fee_reason: bound[16],
        })
        return { success: true }
      }
      if (s.startsWith('update vendor_work_proposals')) {
        const id = bound[bound.length - 1]
        const row = store.proposals.find((p) => p.id === id)
        if (!row) return { success: true }
        if (s.includes("status = 'sent'")) Object.assign(row, { status: 'sent', sent_at: '2026-08-22' })
        else if (s.includes("status = 'withdrawn'")) Object.assign(row, { status: 'withdrawn', withdraw_reason: bound[0] })
        else if (s.includes("status = 'released'")) Object.assign(row, { status: 'released', released_at: '2026-08-22', released_by_user_id: bound[0], field_assignment_id: bound[1] })
        else if (s.includes('status = ?, responded_at')) Object.assign(row, { status: bound[0], responded_at: '2026-08-22', vendor_response_note: bound[1] })
        else if (s.includes('kind = ?, title = ?')) {
          const [kind, title, summary, site_label, site_address, site_city, site_state, site_postal_code,
            scheduled_at, window_start, window_end, respond_by, offer_cents, offer_notes] = bound
          Object.assign(row, { kind, title, summary, site_label, site_address, site_city, site_state, site_postal_code,
            scheduled_at, window_start, window_end, respond_by, offer_cents, offer_notes })
        } else throw new Error(`unhandled update SQL: ${sql}`)
        return { success: true }
      }
      throw new Error(`unhandled run SQL: ${sql}`)
    }
    return api
  }
  return {
    DB: {
      prepare,
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        for (const statement of statements) await statement.run()
        return []
      },
    },
  } as unknown as Env
}

async function call(method: string, path: string, body?: unknown) {
  const res = await vendorProposalRoutes.fetch(
    new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    makeEnv(),
  )
  const json = await res.json().catch(() => null)
  return { status: res.status, body: json as Record<string, unknown> | null }
}

const NEW_PROPOSAL = {
  kind: 'field',
  service_key: 'mobile_notary',
  client_user_id: 'client-1',
  vendor_user_id: 'vendor-1',
  title: 'Estate signing',
  summary: 'Two deeds and a POA at the client home.',
  site_city: 'Boca Raton',
  site_state: 'FL',
  items: [
    { label: 'Signing appointment', amount_cents: 15000 },
    { label: 'Printing', quantity: 60, unit: 'pages', amount_cents: 2000 },
  ],
}

beforeEach(() => {
  idCounter = 0
  sent.length = 0
  audits.length = 0
  activity.length = 0
  currentUser = STAFF
  store = {
    proposals: [],
    items: [],
    assignments: [],
    users: [
      { id: 'client-1', email: 'client@example.test', full_name: 'Dana Client' },
      { id: 'vendor-1', email: 'notary@pmv.test', full_name: 'Nora Notary' },
      { id: 'vendor-2', email: 'other@pmv.test', full_name: 'Otto Other' },
      { id: 'staff-1', email: 'ops@pmv.test', full_name: 'Ops' },
    ],
  }
})

async function draft(overrides: Record<string, unknown> = {}) {
  const res = await call('POST', '/vendor-proposals', { ...NEW_PROPOSAL, ...overrides })
  return (res.body?.proposal as Row).id as string
}

describe('composing a proposal', () => {
  it('saves a draft with its line items and derives the total from them', async () => {
    const res = await call('POST', '/vendor-proposals', NEW_PROPOSAL)
    expect(res.status).toBe(200)
    const proposal = res.body?.proposal as Row
    expect(proposal.status).toBe('draft')
    expect(res.body?.total_cents).toBe(17000)
    expect((res.body?.items as Row[]).map((i) => i.label)).toEqual(['Signing appointment', 'Printing'])
    expect(activity.map((a) => a.kind)).toContain('vendor_proposal_created')
  })

  it('lets a flat offer override the itemization', async () => {
    const res = await call('POST', '/vendor-proposals', { ...NEW_PROPOSAL, offer_cents: 20000 })
    expect(res.body?.total_cents).toBe(20000)
  })

  it('drops unlabeled lines rather than storing blanks', async () => {
    const res = await call('POST', '/vendor-proposals', {
      ...NEW_PROPOSAL,
      items: [{ label: 'Real line', amount_cents: 100 }, { label: '   ', amount_cents: 999 }, { amount_cents: 500 }],
    })
    expect((res.body?.items as Row[]).length).toBe(1)
    expect(res.body?.total_cents).toBe(100)
  })

  it('refuses a proposal missing a client, provider, or service', async () => {
    const res = await call('POST', '/vendor-proposals', { ...NEW_PROPOSAL, vendor_user_id: '' })
    expect(res.status).toBe(400)
  })

  it('does not let a provider account open the compose endpoint', async () => {
    currentUser = VENDOR
    const res = await call('POST', '/vendor-proposals', NEW_PROPOSAL)
    expect(res.status).toBe(403)
  })
})

describe('a draft is private until it is sent', () => {
  it('is invisible to the provider it names', async () => {
    const id = await draft()
    currentUser = VENDOR
    const res = await call('GET', `/vendor-proposals/${id}`)
    expect(res.status).toBe(404)
  })

  it('is left out of the provider list endpoint', async () => {
    await draft()
    currentUser = VENDOR
    const res = await call('GET', '/vendor-proposals/mine')
    expect((res.body?.proposals as Row[]).length).toBe(0)
  })

  it('cannot be answered before it is sent', async () => {
    const id = await draft()
    currentUser = VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    expect(res.status).toBe(409)
  })

  it('is editable, and stops being editable once sent', async () => {
    const id = await draft()
    const edited = await call('PATCH', `/vendor-proposals/${id}`, { title: 'Renamed' })
    expect((edited.body?.proposal as Row).title).toBe('Renamed')

    await call('POST', `/vendor-proposals/${id}/send`, {})
    const late = await call('PATCH', `/vendor-proposals/${id}`, { title: 'Too late' })
    expect(late.status).toBe(409)
  })
})

describe('sending', () => {
  it('emails the provider the terms and records the send', async () => {
    const id = await draft()
    const res = await call('POST', `/vendor-proposals/${id}/send`, {})
    expect(res.status).toBe(200)
    expect((res.body?.proposal as Row).status).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('notary@pmv.test')
    expect(sent[0].subject).toContain('Estate signing')
    // The money and the scope are in the message itself, so accepting later is
    // a confirmation of something already read.
    expect(sent[0].text).toContain('$170.00')
    expect(sent[0].text).toContain('Two deeds and a POA')
    expect(audits.map((a) => a.action)).toContain('vendor_proposal_sent')
  })

  it('refuses to send the same proposal twice', async () => {
    const id = await draft()
    await call('POST', `/vendor-proposals/${id}/send`, {})
    const again = await call('POST', `/vendor-proposals/${id}/send`, {})
    expect(again.status).toBe(409)
  })
})

describe('the provider answers', () => {
  async function sentProposal() {
    const id = await draft()
    await call('POST', `/vendor-proposals/${id}/send`, {})
    sent.length = 0
    return id
  }

  it('accepts, and tells the sender it is waiting on them', async () => {
    const id = await sentProposal()
    currentUser = VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted', note: 'Can do.' })
    expect(res.status).toBe(200)
    expect((res.body?.proposal as Row).status).toBe('accepted')
    expect(sent[0].to).toBe('ops@pmv.test')
    expect(sent[0].text).toContain('release queue')
    expect(audits.map((a) => a.action)).toContain('vendor_proposal_accepted')
  })

  it('declines, and the offer is closed', async () => {
    const id = await sentProposal()
    currentUser = VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'declined', note: 'Booked that day.' })
    expect((res.body?.proposal as Row).status).toBe('declined')
    const again = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    expect(again.status).toBe(409)
  })

  it('is not something another provider can answer', async () => {
    const id = await sentProposal()
    currentUser = OTHER_VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    expect(res.status).toBe(403)
  })

  // Acceptance is the provider's word. Staff releasing on their behalf is the
  // second approval, not a substitute for the first.
  it('is not something staff can do for them', async () => {
    const id = await sentProposal()
    currentUser = ADMIN
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    expect(res.status).toBe(403)
  })

  it('rejects a decision that is not accept or decline', async () => {
    const id = await sentProposal()
    currentUser = VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'maybe' })
    expect(res.status).toBe(400)
  })

  it('will not accept an offer whose respond-by date has passed', async () => {
    const id = await draft({ respond_by: '2020-01-01T00:00:00Z' })
    await call('POST', `/vendor-proposals/${id}/send`, {})
    currentUser = VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    expect(res.status).toBe(409)
    expect(String(res.body?.error)).toContain('respond-by')
  })
})

describe('releasing into real work', () => {
  async function acceptedProposal() {
    const id = await draft()
    await call('POST', `/vendor-proposals/${id}/send`, {})
    currentUser = VENDOR
    await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    currentUser = STAFF
    sent.length = 0
    return id
  }

  it('creates the assignment and points the proposal at it', async () => {
    const id = await acceptedProposal()
    const res = await call('POST', `/vendor-proposals/${id}/release`, {})
    expect(res.status).toBe(200)
    expect(store.assignments).toHaveLength(1)
    const assignment = store.assignments[0]
    expect(assignment.vendor_user_id).toBe('vendor-1')
    expect(assignment.client_user_id).toBe('client-1')
    expect(assignment.title).toBe('Estate signing')
    // The provider is paid what they accepted, not a re-derived estimate.
    expect(assignment.fee).toBe(17000)
    expect(String(assignment.fee_reason)).toContain('work proposal')
    // The scope the provider read travels onto the assignment as its notes.
    expect(String(assignment.notes)).toContain('Two deeds and a POA')
    expect((res.body?.proposal as Row).field_assignment_id).toBe(assignment.id)
    expect(res.body?.assignment_id).toBe(assignment.id)
    expect(audits.map((a) => a.action)).toContain('vendor_proposal_released')
  })

  it('tells the provider the work is confirmed', async () => {
    const id = await acceptedProposal()
    await call('POST', `/vendor-proposals/${id}/release`, {})
    expect(sent[0].to).toBe('notary@pmv.test')
    expect(sent[0].subject).toContain('Confirmed')
  })

  // The gap between accepting and releasing is the point of the whole feature.
  it('cannot happen before the provider has accepted', async () => {
    const id = await draft()
    expect((await call('POST', `/vendor-proposals/${id}/release`, {})).status).toBe(409)
    await call('POST', `/vendor-proposals/${id}/send`, {})
    expect((await call('POST', `/vendor-proposals/${id}/release`, {})).status).toBe(409)
    expect(store.assignments).toHaveLength(0)
  })

  it('cannot happen twice', async () => {
    const id = await acceptedProposal()
    await call('POST', `/vendor-proposals/${id}/release`, {})
    const again = await call('POST', `/vendor-proposals/${id}/release`, {})
    expect(again.status).toBe(409)
    expect(store.assignments).toHaveLength(1)
  })

  it('is not something the provider can do for themselves', async () => {
    const id = await acceptedProposal()
    currentUser = VENDOR
    const res = await call('POST', `/vendor-proposals/${id}/release`, {})
    expect(res.status).toBe(403)
    expect(store.assignments).toHaveLength(0)
  })

  it('honors a schedule change made at the moment of release', async () => {
    const id = await acceptedProposal()
    const res = await call('POST', `/vendor-proposals/${id}/release`, { scheduled_at: '2026-09-01T14:00:00Z' })
    expect(res.status).toBe(200)
    expect(store.assignments[0].scheduled_at).toBe('2026-09-01T14:00:00Z')
  })
})

describe('withdrawing', () => {
  it('pulls back a sent offer so the provider can no longer take it', async () => {
    const id = await draft()
    await call('POST', `/vendor-proposals/${id}/send`, {})
    expect((await call('POST', `/vendor-proposals/${id}/withdraw`, { reason: 'Client rescheduled' })).status).toBe(200)
    currentUser = VENDOR
    expect((await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })).status).toBe(409)
  })

  it('is closed once released', async () => {
    const id = await draft()
    await call('POST', `/vendor-proposals/${id}/send`, {})
    currentUser = VENDOR
    await call('POST', `/vendor-proposals/${id}/respond`, { decision: 'accepted' })
    currentUser = STAFF
    await call('POST', `/vendor-proposals/${id}/release`, {})
    expect((await call('POST', `/vendor-proposals/${id}/withdraw`, {})).status).toBe(409)
  })
})

describe('what each side can list', () => {
  it('gives the provider only their own non-draft offers', async () => {
    const mine = await draft()
    await call('POST', `/vendor-proposals/${mine}/send`, {})
    await draft({ vendor_user_id: 'vendor-2' })

    currentUser = VENDOR
    const res = await call('GET', '/vendor-proposals/mine')
    const rows = res.body?.proposals as Row[]
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(mine)
  })

  it('shows a sent offer as expired once its respond-by date is gone', async () => {
    const id = await draft({ respond_by: '2020-01-01T00:00:00Z' })
    await call('POST', `/vendor-proposals/${id}/send`, {})
    currentUser = VENDOR
    const res = await call('GET', '/vendor-proposals/mine')
    expect((res.body?.proposals as Row[])[0].status_effective).toBe('expired')
  })

  it('carries a real total on list rows, not a placeholder', async () => {
    const id = await draft()
    await call('POST', `/vendor-proposals/${id}/send`, {})
    const res = await call('GET', '/vendor-proposals')
    expect((res.body?.proposals as Row[])[0].total_cents).toBe(17000)
  })
})
