import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { logActivity } from '../activity'
import { actorIp, actorUserAgent, actorGeo, logAudit } from '../auditLog'
import { canAccessClient } from '../scope'
import { sendEmail } from '../email'
import { hqUrl } from '../appUrls'
import { renderVendorProposalEmail } from '../emailTemplates/vendorProposal'
import { resolveEligibleFieldProvider } from '../fieldProviders'
import { syncAssignmentToCalendar } from '../fieldAssignmentCalendar'
import {
  canTransition,
  effectiveStatus,
  formatCents,
  isProposalKind,
  isVendorDecision,
  normalizeLines,
  proposalKindLabel,
  proposalTotalCents,
  type ProposalLine,
} from '../../../shared/vendorProposals'

export const vendorProposalRoutes = new Hono<AppEnv>()

interface ProposalRow {
  id: string
  kind: string
  service_key: string
  client_user_id: string
  vendor_user_id: string
  created_by_user_id: string | null
  title: string | null
  summary: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  scheduled_at: string | null
  window_start: string | null
  window_end: string | null
  respond_by: string | null
  offer_cents: number | null
  offer_notes: string | null
  status: string
  sent_at: string | null
  responded_at: string | null
  vendor_response_note: string | null
  released_at: string | null
  released_by_user_id: string | null
  field_assignment_id: string | null
  withdrawn_at: string | null
  withdraw_reason: string | null
  created_at: string
  updated_at: string
  total_cents?: number
  client_name?: string | null
  client_email?: string | null
  vendor_name?: string | null
  vendor_email?: string | null
}

interface ItemRow {
  id: string
  proposal_id: string
  position: number
  label: string
  detail: string | null
  quantity: number | null
  unit: string | null
  amount_cents: number
}

const SELECT_PROPOSAL = `
  SELECT p.*,
    cu.full_name AS client_name, cu.email AS client_email,
    vu.full_name AS vendor_name, vu.email AS vendor_email,
    -- Mirrors proposalTotalCents(): an explicit offer wins, otherwise the
    -- items are the offer. Computed here so list rows can show a real number
    -- without a second query per proposal.
    CASE WHEN p.offer_cents > 0 THEN p.offer_cents
         ELSE COALESCE((SELECT SUM(i.amount_cents) FROM vendor_work_proposal_items i WHERE i.proposal_id = p.id), 0)
    END AS total_cents
  FROM vendor_work_proposals p
  LEFT JOIN users cu ON cu.id = p.client_user_id
  LEFT JOIN users vu ON vu.id = p.vendor_user_id
`

function str(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// A provider account can see only its own offers, and never the HQ side of the
// desk. Everything staff-only routes through isStaffSide first.
function isStaffSide(user: SessionUser): boolean {
  return user.party_type !== 'vendor'
}

function canViewProposal(user: SessionUser, row: ProposalRow): boolean {
  if (row.vendor_user_id === user.id) return true
  if (!isStaffSide(user)) return false
  return user.role === 'admin' || row.created_by_user_id === user.id
}

async function loadProposal(env: AppEnv['Bindings'], id: string | undefined): Promise<ProposalRow | null> {
  if (!id) return null
  return env.DB.prepare(`${SELECT_PROPOSAL} WHERE p.id = ?`).bind(id).first<ProposalRow>()
}

async function loadItems(env: AppEnv['Bindings'], proposalId: string): Promise<ItemRow[]> {
  const res = await env.DB.prepare(
    'SELECT * FROM vendor_work_proposal_items WHERE proposal_id = ? ORDER BY position ASC, rowid ASC',
  ).bind(proposalId).all<ItemRow>()
  return res.results ?? []
}

function itemsToLines(items: ItemRow[]): ProposalLine[] {
  return items.map((item) => ({
    label: item.label,
    detail: item.detail,
    quantity: item.quantity,
    unit: item.unit,
    amount_cents: item.amount_cents,
  }))
}

async function replaceItems(env: AppEnv['Bindings'], proposalId: string, lines: ProposalLine[]): Promise<void> {
  await env.DB.prepare('DELETE FROM vendor_work_proposal_items WHERE proposal_id = ?').bind(proposalId).run()
  if (!lines.length) return
  const statements = lines.map((line, index) => env.DB.prepare(
    `INSERT INTO vendor_work_proposal_items (id, proposal_id, position, label, detail, quantity, unit, amount_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), proposalId, index, line.label, line.detail, line.quantity, line.unit, line.amount_cents))
  await env.DB.batch(statements)
}

/** The proposal plus everything a caller needs to render it in one payload. */
async function proposalPayload(env: AppEnv['Bindings'], row: ProposalRow) {
  const items = await loadItems(env, row.id)
  const lines = itemsToLines(items)
  return {
    proposal: { ...row, status_effective: effectiveStatus(row.status, row.respond_by) },
    items,
    total_cents: proposalTotalCents(lines, row.offer_cents),
  }
}

// ---------- Staff: compose ----------

vendorProposalRoutes.post('/vendor-proposals', requireStaff, async (c) => {
  const user = c.get('user')
  if (!isStaffSide(user)) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

  const kind = isProposalKind(body.kind) ? body.kind : 'field'
  const serviceKey = str(body.service_key, 100)
  const clientUserId = str(body.client_user_id, 100)
  const vendorUserId = str(body.vendor_user_id, 100)
  if (!serviceKey || !clientUserId || !vendorUserId) {
    return c.json({ error: 'service_key, client_user_id and vendor_user_id are required' }, 400)
  }
  if (!(await canAccessClient(c.env, user, clientUserId))) return c.json({ error: 'forbidden' }, 403)
  const providerId = await resolveEligibleFieldProvider(c.env, vendorUserId)
  if (!providerId) return c.json({ error: 'provider must be an active staff or admin account' }, 400)

  const lines = normalizeLines(body.items)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO vendor_work_proposals (
       id, kind, service_key, client_user_id, vendor_user_id, created_by_user_id,
       title, summary, site_label, site_address, site_city, site_state, site_postal_code,
       scheduled_at, window_start, window_end, respond_by, offer_cents, offer_notes, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
  ).bind(
    id, kind, serviceKey, clientUserId, providerId, user.id,
    str(body.title, 200), str(body.summary, 8000),
    str(body.site_label, 200), str(body.site_address, 300), str(body.site_city, 120),
    str(body.site_state, 60), str(body.site_postal_code, 20),
    str(body.scheduled_at, 40), str(body.window_start, 40), str(body.window_end, 40), str(body.respond_by, 40),
    num(body.offer_cents), str(body.offer_notes, 2000),
  ).run()
  await replaceItems(c.env, id, lines)

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId,
    kind: 'vendor_proposal_created',
    detail: { id, kind, service_key: serviceKey, vendor_user_id: providerId, items: lines.length },
  })

  const row = await loadProposal(c.env, id)
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(await proposalPayload(c.env, row))
})

// Editable only while nobody outside HQ has seen it - once sent, the provider
// is looking at a specific set of terms and the record must keep matching it.
vendorProposalRoutes.patch('/vendor-proposals/:id', requireStaff, async (c) => {
  const user = c.get('user')
  if (!isStaffSide(user)) return c.json({ error: 'forbidden' }, 403)
  const row = await loadProposal(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!canViewProposal(user, row)) return c.json({ error: 'forbidden' }, 403)
  if (row.status !== 'draft') return c.json({ error: 'only a draft can be edited' }, 409)

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const kind = isProposalKind(body.kind) ? body.kind : row.kind
  await c.env.DB.prepare(
    `UPDATE vendor_work_proposals SET
       kind = ?, title = ?, summary = ?,
       site_label = ?, site_address = ?, site_city = ?, site_state = ?, site_postal_code = ?,
       scheduled_at = ?, window_start = ?, window_end = ?, respond_by = ?,
       offer_cents = ?, offer_notes = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(
    kind,
    'title' in body ? str(body.title, 200) : row.title,
    'summary' in body ? str(body.summary, 8000) : row.summary,
    'site_label' in body ? str(body.site_label, 200) : row.site_label,
    'site_address' in body ? str(body.site_address, 300) : row.site_address,
    'site_city' in body ? str(body.site_city, 120) : row.site_city,
    'site_state' in body ? str(body.site_state, 60) : row.site_state,
    'site_postal_code' in body ? str(body.site_postal_code, 20) : row.site_postal_code,
    'scheduled_at' in body ? str(body.scheduled_at, 40) : row.scheduled_at,
    'window_start' in body ? str(body.window_start, 40) : row.window_start,
    'window_end' in body ? str(body.window_end, 40) : row.window_end,
    'respond_by' in body ? str(body.respond_by, 40) : row.respond_by,
    'offer_cents' in body ? num(body.offer_cents) : row.offer_cents,
    'offer_notes' in body ? str(body.offer_notes, 2000) : row.offer_notes,
    row.id,
  ).run()
  if ('items' in body) await replaceItems(c.env, row.id, normalizeLines(body.items))

  const updated = await loadProposal(c.env, row.id)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(await proposalPayload(c.env, updated))
})

// ---------- Staff: send ----------

vendorProposalRoutes.post('/vendor-proposals/:id/send', requireStaff, async (c) => {
  const user = c.get('user')
  if (!isStaffSide(user)) return c.json({ error: 'forbidden' }, 403)
  const row = await loadProposal(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!canViewProposal(user, row)) return c.json({ error: 'forbidden' }, 403)
  if (!canTransition(row.status, 'sent')) return c.json({ error: `cannot send a ${row.status} proposal` }, 409)

  await c.env.DB.prepare(
    `UPDATE vendor_work_proposals SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  ).bind(row.id).run()

  const items = await loadItems(c.env, row.id)
  const lines = itemsToLines(items)
  const totalCents = proposalTotalCents(lines, row.offer_cents)
  if (row.vendor_email) {
    const { subject, html, text } = renderVendorProposalEmail({
      proposal: row,
      lines,
      totalCents,
      vendorName: row.vendor_name ?? null,
      reviewUrl: hqUrl(`/work-offers/${row.id}`),
    })
    // Best-effort: the proposal is already sent as far as the record is
    // concerned, and it is visible in the provider app either way. A mail
    // outage must not leave the row stuck in draft.
    await sendEmail(c.env, { to: row.vendor_email, subject, html, text })
  }

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id,
    kind: 'vendor_proposal_sent',
    detail: { id: row.id, vendor_user_id: row.vendor_user_id, total_cents: totalCents },
  })
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'vendor_proposal_sent',
    entityType: 'vendor_work_proposal',
    entityId: row.id,
    after: { vendor_user_id: row.vendor_user_id, total_cents: totalCents },
  })

  const updated = await loadProposal(c.env, row.id)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(await proposalPayload(c.env, updated))
})

// ---------- Staff: withdraw ----------

vendorProposalRoutes.post('/vendor-proposals/:id/withdraw', requireStaff, async (c) => {
  const user = c.get('user')
  if (!isStaffSide(user)) return c.json({ error: 'forbidden' }, 403)
  const row = await loadProposal(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!canViewProposal(user, row)) return c.json({ error: 'forbidden' }, 403)
  if (!canTransition(row.status, 'withdrawn')) return c.json({ error: `cannot withdraw a ${row.status} proposal` }, 409)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

  await c.env.DB.prepare(
    `UPDATE vendor_work_proposals SET status = 'withdrawn', withdrawn_at = datetime('now'),
       withdraw_reason = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(str(body.reason, 500), row.id).run()

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id,
    kind: 'vendor_proposal_withdrawn',
    detail: { id: row.id, from_status: row.status, vendor_user_id: row.vendor_user_id },
  })
  return c.json({ ok: true })
})

// ---------- Provider: accept or decline ----------

vendorProposalRoutes.post('/vendor-proposals/:id/respond', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadProposal(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  // Only the provider the offer was made to may answer it. Staff cannot
  // accept on a provider's behalf: the acceptance is the provider's word.
  if (row.vendor_user_id !== user.id) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const decision = body.decision
  if (!isVendorDecision(decision)) return c.json({ error: 'decision must be accepted or declined' }, 400)
  if (!canTransition(row.status, decision)) return c.json({ error: `this offer is ${row.status}` }, 409)
  if (effectiveStatus(row.status, row.respond_by) === 'expired') {
    return c.json({ error: 'the respond-by date for this offer has passed' }, 409)
  }

  await c.env.DB.prepare(
    `UPDATE vendor_work_proposals SET status = ?, responded_at = datetime('now'),
       vendor_response_note = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(decision, str(body.note, 2000), row.id).run()

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id,
    kind: decision === 'accepted' ? 'vendor_proposal_accepted' : 'vendor_proposal_declined',
    detail: { id: row.id, vendor_user_id: row.vendor_user_id },
  })
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: decision === 'accepted' ? 'vendor_proposal_accepted' : 'vendor_proposal_declined',
    entityType: 'vendor_work_proposal',
    entityId: row.id,
    before: { status: row.status },
    after: { status: decision },
  })

  // Tell the person who sent it. An accepted offer is now sitting in their
  // release queue waiting on a decision only they can make.
  await notifyAuthor(c.env, row, decision, str(body.note, 2000))

  const updated = await loadProposal(c.env, row.id)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(await proposalPayload(c.env, updated))
})

async function notifyAuthor(
  env: AppEnv['Bindings'],
  row: ProposalRow,
  decision: string,
  note: string | null,
): Promise<void> {
  if (!row.created_by_user_id) return
  const author = await env.DB.prepare('SELECT email, full_name FROM users WHERE id = ?')
    .bind(row.created_by_user_id).first<{ email: string | null; full_name: string | null }>()
  if (!author?.email) return
  const provider = row.vendor_name || row.vendor_email || 'The provider'
  const label = row.title?.trim() || proposalKindLabel(row.kind)
  const accepted = decision === 'accepted'
  const line = accepted
    ? `${provider} accepted your work offer for ${label}. It is waiting in your release queue - releasing it creates the assignment.`
    : `${provider} declined your work offer for ${label}.`
  await sendEmail(env, {
    to: author.email,
    subject: accepted ? `Accepted: ${label}` : `Declined: ${label}`,
    html: `<p>${escapeForEmail(line)}</p>${note ? `<p><em>${escapeForEmail(note)}</em></p>` : ''}<p><a href="${hqUrl(`/work-proposals/${row.id}`)}">Open the proposal</a></p>`,
    text: `${line}${note ? `\n\n"${note}"` : ''}\n\n${hqUrl(`/work-proposals/${row.id}`)}`,
  })
}

function escapeForEmail(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------- Staff: release into real work ----------

vendorProposalRoutes.post('/vendor-proposals/:id/release', requireStaff, async (c) => {
  const user = c.get('user')
  if (!isStaffSide(user)) return c.json({ error: 'forbidden' }, 403)
  const row = await loadProposal(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!canViewProposal(user, row)) return c.json({ error: 'forbidden' }, 403)
  if (row.status !== 'accepted') {
    return c.json({ error: 'only an accepted proposal can be released into work' }, 409)
  }
  if (row.field_assignment_id) {
    return c.json({ error: 'already released', assignment_id: row.field_assignment_id }, 409)
  }
  if (!(await canAccessClient(c.env, user, row.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const items = await loadItems(c.env, row.id)
  const totalCents = proposalTotalCents(itemsToLines(items), row.offer_cents)
  // Staff may move the appointment at the moment of release without editing the
  // agreed terms; everything else comes from what the provider accepted.
  const scheduledAt = str(body.scheduled_at, 40) ?? row.scheduled_at

  const assignmentId = uuid()
  await c.env.DB.prepare(
    `INSERT INTO field_assignments (
       id, kind, service_key, client_user_id, vendor_user_id, assigned_by_user_id,
       title, site_label, site_address, site_city, site_state, site_postal_code,
       scheduled_at, notes, vendor_fee_base_cents, vendor_fee_adjustment_cents, vendor_fee_cents, vendor_fee_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(
    assignmentId, row.kind, row.service_key, row.client_user_id, row.vendor_user_id, user.id,
    row.title, row.site_label, row.site_address, row.site_city, row.site_state, row.site_postal_code,
    scheduledAt, row.summary, totalCents, totalCents,
    `Released from accepted work proposal ${row.id}`,
  ).run()

  await c.env.DB.prepare(
    `UPDATE vendor_work_proposals SET status = 'released', released_at = datetime('now'),
       released_by_user_id = ?, field_assignment_id = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(user.id, assignmentId, row.id).run()

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id,
    kind: 'vendor_proposal_released',
    detail: { id: row.id, assignment_id: assignmentId, vendor_user_id: row.vendor_user_id, total_cents: totalCents },
  })
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'vendor_proposal_released',
    entityType: 'vendor_work_proposal',
    entityId: row.id,
    after: { assignment_id: assignmentId, total_cents: totalCents },
  })

  // Releasing is the moment work becomes real, so it is the moment the
  // provider's calendar should know about it. The invite reschedules and
  // cancels itself from here on.
  await syncAssignmentToCalendar(c.env, {
    id: assignmentId,
    kind: row.kind,
    service_key: row.service_key,
    title: row.title,
    site_label: row.site_label,
    site_address: row.site_address,
    site_city: row.site_city,
    site_state: row.site_state,
    site_postal_code: row.site_postal_code,
    scheduled_at: scheduledAt,
    client_user_id: row.client_user_id,
    vendor_user_id: row.vendor_user_id,
    assigned_by_user_id: user.id,
    notes: row.summary,
  })

  if (row.vendor_email) {
    const label = row.title?.trim() || proposalKindLabel(row.kind)
    await sendEmail(c.env, {
      to: row.vendor_email,
      subject: `Confirmed: ${label}`,
      html: `<p>${escapeForEmail(`Your accepted offer for ${label} is now a confirmed assignment at ${formatCents(totalCents)}.`)}</p><p><a href="${hqUrl(`/field-work/${assignmentId}`)}">Open the assignment</a></p>`,
      text: `Your accepted offer for ${label} is now a confirmed assignment at ${formatCents(totalCents)}.\n\n${hqUrl(`/field-work/${assignmentId}`)}`,
    })
  }

  const updated = await loadProposal(c.env, row.id)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json({ ...(await proposalPayload(c.env, updated)), assignment_id: assignmentId })
})

// ---------- Reads ----------

vendorProposalRoutes.get('/vendor-proposals', requireStaff, async (c) => {
  const user = c.get('user')
  const status = c.req.query('status') || ''
  const clauses: string[] = ['1=1']
  const params: unknown[] = []
  if (!isStaffSide(user)) {
    // A provider hitting the staff list gets their own offers, never the desk.
    clauses.push('p.vendor_user_id = ?')
    params.push(user.id)
    clauses.push("p.status <> 'draft'")
  } else if (user.role !== 'admin') {
    clauses.push('(p.created_by_user_id = ? OR p.vendor_user_id = ?)')
    params.push(user.id, user.id)
  }
  if (status) { clauses.push('p.status = ?'); params.push(status) }
  const res = await c.env.DB.prepare(
    `${SELECT_PROPOSAL} WHERE ${clauses.join(' AND ')}
     ORDER BY (p.status = 'accepted') DESC, (p.status = 'sent') DESC, p.created_at DESC
     LIMIT 200`,
  ).bind(...params).all<ProposalRow>()
  const rows = res.results ?? []
  return c.json({
    proposals: rows.map((row) => ({ ...row, status_effective: effectiveStatus(row.status, row.respond_by) })),
  })
})

// What the provider app asks for: offers addressed to me that I have not been
// shielded from. Drafts never appear here.
vendorProposalRoutes.get('/vendor-proposals/mine', requireStaff, async (c) => {
  const user = c.get('user')
  const res = await c.env.DB.prepare(
    `${SELECT_PROPOSAL} WHERE p.vendor_user_id = ? AND p.status <> 'draft'
     ORDER BY (p.status = 'sent') DESC, COALESCE(p.scheduled_at, p.created_at) DESC
     LIMIT 200`,
  ).bind(user.id).all<ProposalRow>()
  const rows = res.results ?? []
  return c.json({
    proposals: rows.map((row) => ({ ...row, status_effective: effectiveStatus(row.status, row.respond_by) })),
  })
})

vendorProposalRoutes.get('/vendor-proposals/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadProposal(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!canViewProposal(user, row)) return c.json({ error: 'forbidden' }, 403)
  // A provider must never see a draft, even one addressed to them.
  if (row.status === 'draft' && !isStaffSide(user)) return c.json({ error: 'not found' }, 404)
  return c.json(await proposalPayload(c.env, row))
})
