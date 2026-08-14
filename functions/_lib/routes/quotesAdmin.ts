import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { logActivity } from '../activity'
import { escapeHtml, notifyStaff, sendEmailStrict } from '../email'
import { renderHqEmailOrFallback } from '../hqEmailTemplates'
import { PUBLIC_SITE_BASE } from '../scopeFunnel'
import { applyCatalogToQuoteLines, type CatalogOffering } from '../../../shared/quoteCatalog'
import { ensureServiceOfferingsSeeded } from './serviceOfferings'

// Branded quote workspace: staff build quotes (optionally from reusable
// templates), send a branded public link, and the recipient accepts or
// declines without an account.

export const quoteAdminRoutes = new Hono<AppEnv>()
export const quotePublicRoutes = new Hono<AppEnv>()

const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'void'] as const
const EDITABLE_STATUSES = new Set(['draft', 'sent', 'viewed'])

const text = (value: unknown, max = 500): string => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cents = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export interface QuoteLineInput {
  offering_id?: string | null
  name?: string
  description?: string
  quantity?: number
  unit_price_cents?: number
  discount_cents?: number
  is_optional?: boolean
  is_pass_through?: boolean
}

async function loadOfferingCatalog(env: Env): Promise<Map<string, CatalogOffering>> {
  await ensureServiceOfferingsSeeded(env)
  const rows = await env.DB.prepare(
    'SELECT id, name, description, starting_price_cents, pricing_label FROM service_offerings WHERE active = 1',
  ).all<CatalogOffering>()
  return new Map((rows.results || []).map((row) => [row.id, row]))
}

async function resolveQuoteLines(env: Env, raw: QuoteLineInput[]) {
  const catalog = await loadOfferingCatalog(env)
  return normalizeQuoteLines(applyCatalogToQuoteLines(raw, catalog))
}

interface NormalizedLine {
  offering_id: string | null
  name: string
  description: string | null
  quantity: number
  unit_price_cents: number
  discount_cents: number
  is_optional: 0 | 1
  is_pass_through: 0 | 1
  sort_order: number
}

export function normalizeQuoteLines(raw: QuoteLineInput[]): { lines: NormalizedLine[]; subtotal: number; discount: number; total: number } {
  const lines: NormalizedLine[] = []
  for (const [index, item] of raw.slice(0, 60).entries()) {
    const name = text(item?.name, 200)
    if (!name) continue
    const quantity = Math.min(999, Math.max(0.25, Number(item?.quantity) || 1))
    lines.push({
      offering_id: text(item?.offering_id, 100) || null,
      name,
      description: text(item?.description, 1000) || null,
      quantity,
      unit_price_cents: cents(item?.unit_price_cents),
      discount_cents: cents(item?.discount_cents),
      is_optional: item?.is_optional === true ? 1 : 0,
      is_pass_through: item?.is_pass_through === true ? 1 : 0,
      sort_order: index * 10,
    })
  }
  // Optional lines (e.g. a standby RON session) are presented on the quote
  // but excluded from the committed total until the client chooses them.
  const billable = lines.filter((line) => !line.is_optional)
  const subtotal = billable.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price_cents), 0)
  const discount = billable.reduce((sum, line) => sum + line.discount_cents, 0)
  return { lines, subtotal, discount, total: Math.max(0, subtotal - discount) }
}

function parseTemplateLines(raw: string | null | undefined): QuoteLineInput[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map((item) => ({
      offering_id: typeof item?.offering_id === 'string' ? item.offering_id : null,
      name: typeof item?.name === 'string' ? item.name : '',
      description: typeof item?.description === 'string' ? item.description : '',
      quantity: Number(item?.quantity) || 1,
      unit_price_cents: Number(item?.unit_price_cents) || 0,
      discount_cents: Number(item?.discount_cents) || 0,
      is_optional: item?.is_optional === 1 || item?.is_optional === true,
      is_pass_through: item?.is_pass_through === 1 || item?.is_pass_through === true,
    })) : []
  } catch {
    return []
  }
}

async function insertEvent(c: any, quoteId: string, kind: string, actor: string, detail?: string) {
  await c.env.DB.prepare('INSERT INTO service_quote_events (id, quote_id, kind, actor, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), quoteId, kind, actor, detail || null).run()
}

// ---------------------------------------------------------------- templates

quoteAdminRoutes.get('/quote-templates', requireStaff, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM service_quote_templates ORDER BY active DESC, sort_order, name').all<any>()
  return c.json({
    templates: (rows.results || []).map((row) => ({ ...row, line_items: parseTemplateLines(row.line_items_json) })),
  })
})

quoteAdminRoutes.post('/quote-templates', requireStaff, async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  const name = text(body?.name, 160)
  if (!name) return c.json({ error: 'template name is required' }, 400)
  const { lines } = await resolveQuoteLines(c.env, Array.isArray(body?.line_items) ? body.line_items : [])
  if (!lines.length) return c.json({ error: 'add at least one line item' }, 400)
  const id = `tpl-${uuid().slice(0, 12)}`
  await c.env.DB.prepare(
    `INSERT INTO service_quote_templates (id, name, service_key, description, intro_message, terms, line_items_json, valid_days, sort_order, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, name, text(body?.service_key, 100) || null, text(body?.description, 500) || null,
    text(body?.intro_message, 4000) || null, text(body?.terms, 4000) || null,
    JSON.stringify(lines), Math.min(120, Math.max(1, Math.round(Number(body?.valid_days) || 14))),
    Math.round(Number(body?.sort_order) || 0), c.get('user').id,
  ).run()
  return c.json({ ok: true, id }, 201)
})

quoteAdminRoutes.patch('/quote-templates/:id', requireStaff, async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value) }
  if (typeof body.name === 'string' && body.name.trim()) add('name', text(body.name, 160))
  if ('service_key' in body) add('service_key', text(body.service_key, 100) || null)
  if ('description' in body) add('description', text(body.description, 500) || null)
  if ('intro_message' in body) add('intro_message', text(body.intro_message, 4000) || null)
  if ('terms' in body) add('terms', text(body.terms, 4000) || null)
  if (Array.isArray(body.line_items)) {
    const { lines } = await resolveQuoteLines(c.env, body.line_items)
    if (!lines.length) return c.json({ error: 'a template needs at least one line item' }, 400)
    add('line_items_json', JSON.stringify(lines))
  }
  if ('valid_days' in body) add('valid_days', Math.min(120, Math.max(1, Math.round(Number(body.valid_days) || 14))))
  if (typeof body.active === 'boolean') add('active', body.active ? 1 : 0)
  if ('sort_order' in body) add('sort_order', Math.round(Number(body.sort_order) || 0))
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400)
  sets.push(`updated_at = datetime('now')`)
  const result = await c.env.DB.prepare(`UPDATE service_quote_templates SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values, c.req.param('id') || '').run()
  if (!result.meta.changes) return c.json({ error: 'template not found' }, 404)
  return c.json({ ok: true })
})

quoteAdminRoutes.delete('/quote-templates/:id', requireStaff, async (c) => {
  // Archive rather than delete so historical quotes keep their template link.
  const result = await c.env.DB.prepare("UPDATE service_quote_templates SET active = 0, updated_at = datetime('now') WHERE id = ?")
    .bind(c.req.param('id') || '').run()
  if (!result.meta.changes) return c.json({ error: 'template not found' }, 404)
  return c.json({ ok: true })
})

// ------------------------------------------------------------------- quotes

quoteAdminRoutes.get('/quotes', requireStaff, async (c) => {
  const status = text(c.req.query('status'), 30)
  const search = text(c.req.query('q'), 120)
  const clauses: string[] = ['1=1']
  const binds: unknown[] = []
  if (status && (QUOTE_STATUSES as readonly string[]).includes(status)) { clauses.push('q.status = ?'); binds.push(status) }
  if (search) {
    const like = `%${search.toLowerCase()}%`
    clauses.push(`(LOWER(q.quote_number) LIKE ? OR LOWER(q.title) LIKE ? OR LOWER(q.recipient_name) LIKE ? OR LOWER(q.recipient_email) LIKE ? OR LOWER(COALESCE(q.recipient_company,'')) LIKE ?)`)
    binds.push(like, like, like, like, like)
  }
  const rows = await c.env.DB.prepare(
    `SELECT q.id, q.quote_number, q.public_token, q.status, q.title, q.recipient_name, q.recipient_email, q.recipient_company,
            q.service_key, q.total_cents, q.valid_until, q.sent_at, q.viewed_at, q.decided_at, q.decision_note, q.client_user_id, q.created_at,
            (SELECT COUNT(*) FROM service_quote_line_items li WHERE li.quote_id = q.id) AS line_item_count,
            (SELECT i.id FROM invoices i WHERE i.quote_id = q.id AND i.status != 'void' ORDER BY i.created_at DESC LIMIT 1) AS invoice_id,
            (SELECT i.invoice_number FROM invoices i WHERE i.quote_id = q.id AND i.status != 'void' ORDER BY i.created_at DESC LIMIT 1) AS invoice_number,
            (SELECT i.status FROM invoices i WHERE i.quote_id = q.id AND i.status != 'void' ORDER BY i.created_at DESC LIMIT 1) AS invoice_status
     FROM service_quotes q
     WHERE ${clauses.join(' AND ')}
     ORDER BY CASE q.status WHEN 'draft' THEN 0 WHEN 'sent' THEN 1 WHEN 'viewed' THEN 1 ELSE 2 END, q.created_at DESC
     LIMIT 300`,
  ).bind(...binds).all()
  return c.json({ quotes: rows.results || [] })
})

quoteAdminRoutes.get('/quotes/:id', requireStaff, async (c) => {
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE id = ?').bind(c.req.param('id') || '').first<any>()
  if (!quote) return c.json({ error: 'quote not found' }, 404)
  const [lines, events, invoice] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM service_quote_line_items WHERE quote_id = ? ORDER BY sort_order, created_at').bind(quote.id).all(),
    c.env.DB.prepare('SELECT kind, actor, detail, created_at FROM service_quote_events WHERE quote_id = ? ORDER BY created_at DESC LIMIT 50').bind(quote.id).all(),
    c.env.DB.prepare(
      `SELECT id, invoice_number, status, amount_cents FROM invoices WHERE quote_id = ? AND status != 'void' ORDER BY created_at DESC LIMIT 1`,
    ).bind(quote.id).first(),
  ])
  return c.json({ quote, line_items: lines.results || [], events: events.results || [], invoice: invoice || null })
})

quoteAdminRoutes.post('/quotes', requireStaff, async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const recipientName = text(body.recipient_name, 160)
  const recipientEmail = text(body.recipient_email, 200).toLowerCase()
  if (!recipientName) return c.json({ error: 'recipient name is required' }, 400)
  if (!emailOk(recipientEmail)) return c.json({ error: 'enter a valid recipient email' }, 400)

  let template: any = null
  const templateId = text(body.template_id, 100)
  if (templateId) {
    template = await c.env.DB.prepare('SELECT * FROM service_quote_templates WHERE id = ?').bind(templateId).first<any>()
    if (!template) return c.json({ error: 'quote template not found' }, 404)
  }

  const rawLines: QuoteLineInput[] = Array.isArray(body.line_items) && body.line_items.length
    ? body.line_items
    : template ? parseTemplateLines(template.line_items_json) : []
  const { lines, subtotal, discount, total } = await resolveQuoteLines(c.env, rawLines)
  if (!lines.length) return c.json({ error: 'add at least one line item' }, 400)

  const id = uuid()
  const token = uuid()
  const now = new Date()
  const quoteNumber = text(body.quote_number, 60) || `PMV-Q-${now.getUTCFullYear()}-${now.getTime().toString().slice(-6)}`
  const validDays = Math.min(120, Math.max(1, Math.round(Number(body.valid_days) || Number(template?.valid_days) || 14)))
  const validUntil = text(body.valid_until, 40) || new Date(now.getTime() + validDays * 86_400_000).toISOString().slice(0, 10)

  let clientUserId = text(body.client_user_id, 100) || null
  if (clientUserId) {
    const owned = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'client'").bind(clientUserId).first<{ id: string }>()
    if (!owned) clientUserId = null
  }
  if (!clientUserId) {
    const match = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'client' AND lower(email) = lower(?)").bind(recipientEmail).first<{ id: string }>()
    clientUserId = match?.id || null
  }

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO service_quotes
        (id, public_token, quote_number, status, title, client_user_id, scope_request_id, template_id, service_key,
         recipient_name, recipient_email, recipient_phone, recipient_company, property_address,
         intro_message, scope_notes, terms, pass_through_note, valid_until,
         subtotal_cents, discount_cents, total_cents, created_by_user_id)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, token, quoteNumber,
      text(body.title, 200) || template?.name || 'Service quote',
      clientUserId,
      text(body.scope_request_id, 100) || null,
      template?.id || null,
      text(body.service_key, 100) || template?.service_key || null,
      recipientName, recipientEmail,
      text(body.recipient_phone, 50) || null,
      text(body.recipient_company, 200) || null,
      text(body.property_address, 300) || null,
      text(body.intro_message, 4000) || template?.intro_message || null,
      text(body.scope_notes, 4000) || null,
      text(body.terms, 4000) || template?.terms || null,
      text(body.pass_through_note, 1000) || null,
      validUntil, subtotal, discount, total, actor.id,
    ),
    ...lines.map((line) => c.env.DB.prepare(
      `INSERT INTO service_quote_line_items
        (id, quote_id, offering_id, name, description, quantity, unit_price_cents, discount_cents, is_optional, is_pass_through, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), id, line.offering_id, line.name, line.description, line.quantity, line.unit_price_cents, line.discount_cents, line.is_optional, line.is_pass_through, line.sort_order)),
    c.env.DB.prepare('INSERT INTO service_quote_events (id, quote_id, kind, actor, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), id, 'created', `staff:${actor.id}`, template ? `from template ${template.name}` : null),
  ]

  try {
    await c.env.DB.batch(statements)
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return c.json({ error: 'quote number already exists' }, 409)
    // FK failures usually mean a stale offering id on a line item.
    if (err instanceof Error && /FOREIGN KEY/i.test(err.message)) return c.json({ error: 'a line item references an unknown offering' }, 400)
    throw err
  }

  await logActivity(c.env, { actorUserId: actor.id, kind: 'quote_created', detail: { quote_id: id, quote_number: quoteNumber, total_cents: total } })
  return c.json({ ok: true, id, quote_number: quoteNumber, public_token: token, total_cents: total }, 201)
})

quoteAdminRoutes.patch('/quotes/:id', requireStaff, async (c) => {
  const actor = c.get('user')
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE id = ?').bind(c.req.param('id') || '').first<any>()
  if (!quote) return c.json({ error: 'quote not found' }, 404)
  if (!EDITABLE_STATUSES.has(quote.status)) return c.json({ error: `a ${quote.status} quote can no longer be edited` }, 409)

  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value) }
  if (typeof body.title === 'string' && body.title.trim()) add('title', text(body.title, 200))
  if ('recipient_name' in body && text(body.recipient_name, 160)) add('recipient_name', text(body.recipient_name, 160))
  if ('recipient_email' in body) {
    const email = text(body.recipient_email, 200).toLowerCase()
    if (!emailOk(email)) return c.json({ error: 'enter a valid recipient email' }, 400)
    add('recipient_email', email)
  }
  if ('recipient_phone' in body) add('recipient_phone', text(body.recipient_phone, 50) || null)
  if ('recipient_company' in body) add('recipient_company', text(body.recipient_company, 200) || null)
  if ('property_address' in body) add('property_address', text(body.property_address, 300) || null)
  if ('intro_message' in body) add('intro_message', text(body.intro_message, 4000) || null)
  if ('scope_notes' in body) add('scope_notes', text(body.scope_notes, 4000) || null)
  if ('terms' in body) add('terms', text(body.terms, 4000) || null)
  if ('pass_through_note' in body) add('pass_through_note', text(body.pass_through_note, 1000) || null)
  if ('valid_until' in body) add('valid_until', text(body.valid_until, 40) || null)
  if ('service_key' in body) add('service_key', text(body.service_key, 100) || null)

  const statements: D1PreparedStatement[] = []
  if (Array.isArray(body.line_items)) {
    const { lines, subtotal, discount, total } = await resolveQuoteLines(c.env, body.line_items)
    if (!lines.length) return c.json({ error: 'a quote needs at least one line item' }, 400)
    add('subtotal_cents', subtotal)
    add('discount_cents', discount)
    add('total_cents', total)
    statements.push(c.env.DB.prepare('DELETE FROM service_quote_line_items WHERE quote_id = ?').bind(quote.id))
    statements.push(...lines.map((line) => c.env.DB.prepare(
      `INSERT INTO service_quote_line_items
        (id, quote_id, offering_id, name, description, quantity, unit_price_cents, discount_cents, is_optional, is_pass_through, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), quote.id, line.offering_id, line.name, line.description, line.quantity, line.unit_price_cents, line.discount_cents, line.is_optional, line.is_pass_through, line.sort_order)))
  }
  if (!sets.length && !statements.length) return c.json({ error: 'nothing to update' }, 400)
  sets.push(`updated_at = datetime('now')`)
  statements.unshift(c.env.DB.prepare(`UPDATE service_quotes SET ${sets.join(', ')} WHERE id = ?`).bind(...values, quote.id))
  statements.push(c.env.DB.prepare('INSERT INTO service_quote_events (id, quote_id, kind, actor) VALUES (?, ?, ?, ?)')
    .bind(uuid(), quote.id, 'updated', `staff:${actor.id}`))

  try {
    await c.env.DB.batch(statements)
  } catch (err) {
    if (err instanceof Error && /FOREIGN KEY/i.test(err.message)) return c.json({ error: 'a line item references an unknown offering' }, 400)
    throw err
  }
  return c.json({ ok: true })
})

quoteAdminRoutes.post('/quotes/:id/send', requireStaff, async (c) => {
  const actor = c.get('user')
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE id = ?').bind(c.req.param('id') || '').first<any>()
  if (!quote) return c.json({ error: 'quote not found' }, 404)
  if (!EDITABLE_STATUSES.has(quote.status)) return c.json({ error: `a ${quote.status} quote cannot be re-sent` }, 409)

  const url = `${PUBLIC_SITE_BASE}/quote/${encodeURIComponent(quote.public_token)}`
  const amount = `$${(Number(quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const validUntil = quote.valid_until
    ? new Date(`${String(quote.valid_until).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const htmlFallback = [
    `<p>Hi ${escapeHtml(quote.recipient_name)},</p>`,
    `<p>Pinnacle Management Ventures has prepared quote <strong>${escapeHtml(quote.quote_number)}</strong> - ${escapeHtml(quote.title)} - for <strong>${escapeHtml(amount)}</strong>.</p>`,
    quote.intro_message ? `<p>${escapeHtml(quote.intro_message)}</p>` : '',
    `<p><a href="${url}">Review and accept your quote</a></p>`,
    validUntil ? `<p>This quote is valid through ${escapeHtml(validUntil)}.</p>` : '',
    '<p>Reply to this email or call (561) 388-7879 with any questions.</p>',
  ].join('')
  const rendered = await renderHqEmailOrFallback(c.env, 'quote_send', {
    first_name: String(quote.recipient_name || 'there').trim().split(/\s+/)[0] || 'there',
    quote_number: String(quote.quote_number || ''),
    quote_title: String(quote.title || ''),
    quote_amount: amount,
    quote_intro: quote.intro_message ? String(quote.intro_message) : '',
    valid_until: validUntil || '',
    action_url: url,
  }, {
    subject: `Your Pinnacle quote ${quote.quote_number} - ${amount}`,
    html: htmlFallback,
    text: `Pinnacle quote ${quote.quote_number}: ${quote.title}, ${amount}. Review and accept at ${url}`,
  })
  const html = rendered.html

  // Without an email provider the quote still goes live on its public link so
  // staff can share it manually; the response tells the UI no email was sent.
  let emailed = false
  if (c.env.RESEND_API_KEY) {
    try {
      await sendEmailStrict(c.env, {
        to: quote.recipient_email,
        subject: rendered.subject,
        html,
        text: rendered.text,
        replyTo: 'orders@pinnaclemanagementventures.com',
        idempotencyKey: `quote/${quote.id}/${new Date().toISOString().slice(0, 16)}`,
        tags: [{ name: 'type', value: 'quote' }],
      })
      emailed = true
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'could not send the quote email' }, 502)
    }
  }

  await c.env.DB.prepare("UPDATE service_quotes SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(quote.id).run()
  await insertEvent(c, quote.id, 'sent', `staff:${actor.id}`, emailed ? quote.recipient_email : 'link only (email not configured)')
  await logActivity(c.env, { actorUserId: actor.id, kind: 'quote_sent', detail: { quote_id: quote.id, quote_number: quote.quote_number, total_cents: quote.total_cents, emailed } })
  return c.json({ ok: true, url, emailed })
})

quoteAdminRoutes.patch('/quotes/:id/status', requireStaff, async (c) => {
  const actor = c.get('user')
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE id = ?').bind(c.req.param('id') || '').first<any>()
  if (!quote) return c.json({ error: 'quote not found' }, 404)
  const body = await c.req.json<{ status?: string; note?: string }>().catch(() => ({} as { status?: string; note?: string }))
  // Staff can void a live quote or record an offline decision, with an optional note.
  const next = body.status && ['void', 'accepted', 'declined'].includes(body.status) ? body.status : null
  if (!next) return c.json({ error: 'status must be void, accepted, or declined' }, 400)
  if (['accepted', 'declined', 'void'].includes(quote.status)) return c.json({ error: `quote is already ${quote.status}` }, 409)
  const note = next === 'void' ? null : (text(body.note, 1000) || null)
  if (next === 'accepted' || next === 'declined') {
    await c.env.DB.prepare("UPDATE service_quotes SET status = ?, decided_at = datetime('now'), decision_note = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(next, note, quote.id).run()
  } else {
    await c.env.DB.prepare("UPDATE service_quotes SET status = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .bind(next, quote.id).run()
  }
  await insertEvent(c, quote.id, next === 'void' ? 'voided' : next, `staff:${actor.id}`, note || undefined)
  return c.json({ ok: true })
})

// -------------------------------------------------------------- public view

function publicQuoteShape(quote: any, lines: any[]) {
  return {
    quote_number: quote.quote_number,
    status: quote.status,
    title: quote.title,
    recipient_name: quote.recipient_name,
    recipient_company: quote.recipient_company,
    property_address: quote.property_address,
    intro_message: quote.intro_message,
    scope_notes: quote.scope_notes,
    terms: quote.terms,
    pass_through_note: quote.pass_through_note,
    valid_until: quote.valid_until,
    subtotal_cents: quote.subtotal_cents,
    discount_cents: quote.discount_cents,
    total_cents: quote.total_cents,
    sent_at: quote.sent_at,
    decided_at: quote.decided_at,
    decision_note: quote.decision_note || null,
    created_at: quote.created_at,
    line_items: lines.map((line) => ({
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
      discount_cents: line.discount_cents,
      is_optional: !!line.is_optional,
      is_pass_through: !!line.is_pass_through,
    })),
  }
}

function isExpired(quote: any): boolean {
  if (!quote.valid_until) return false
  return new Date(`${String(quote.valid_until).slice(0, 10)}T23:59:59`) < new Date()
}

quotePublicRoutes.get('/public-quotes/:token', async (c) => {
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE public_token = ?').bind(c.req.param('token') || '').first<any>()
  if (!quote || quote.status === 'void' || quote.status === 'draft') return c.json({ error: 'quote not found' }, 404)
  const lines = await c.env.DB.prepare('SELECT * FROM service_quote_line_items WHERE quote_id = ? ORDER BY sort_order, created_at').bind(quote.id).all<any>()

  if (quote.status === 'sent') {
    await c.env.DB.prepare("UPDATE service_quotes SET status = 'viewed', viewed_at = COALESCE(viewed_at, datetime('now')), updated_at = datetime('now') WHERE id = ? AND status = 'sent'").bind(quote.id).run()
    await insertEvent(c, quote.id, 'viewed', 'recipient')
    quote.status = 'viewed'
  }
  if ((quote.status === 'sent' || quote.status === 'viewed') && isExpired(quote)) {
    await c.env.DB.prepare("UPDATE service_quotes SET status = 'expired', updated_at = datetime('now') WHERE id = ?").bind(quote.id).run()
    quote.status = 'expired'
  }
  return c.json({ quote: publicQuoteShape(quote, lines.results || []) }, { headers: { 'Cache-Control': 'no-store' } })
})

quotePublicRoutes.post('/public-quotes/:token/respond', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const decision = body.decision === 'accept' ? 'accepted' : body.decision === 'decline' ? 'declined' : null
  if (!decision) return c.json({ error: 'decision must be accept or decline' }, 400)
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE public_token = ?').bind(c.req.param('token') || '').first<any>()
  if (!quote || quote.status === 'void' || quote.status === 'draft') return c.json({ error: 'quote not found' }, 404)
  if (['accepted', 'declined', 'expired'].includes(quote.status)) return c.json({ error: `this quote is already ${quote.status}` }, 409)
  if (isExpired(quote)) {
    await c.env.DB.prepare("UPDATE service_quotes SET status = 'expired', updated_at = datetime('now') WHERE id = ?").bind(quote.id).run()
    return c.json({ error: 'this quote has expired; contact Pinnacle for updated pricing' }, 409)
  }
  const note = text(body.note, 1000) || null
  await c.env.DB.prepare("UPDATE service_quotes SET status = ?, decided_at = datetime('now'), decision_note = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(decision, note, quote.id).run()
  await insertEvent(c, quote.id, decision, 'recipient', note || undefined)
  await logActivity(c.env, { kind: `quote_${decision}`, detail: { quote_id: quote.id, quote_number: quote.quote_number, total_cents: quote.total_cents } })
  const amount = `$${(Number(quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  c.executionCtx.waitUntil(notifyStaff(c.env, {
    staffUserIds: [],
    kind: 'lead_created',
    subject: `Quote ${decision}: ${quote.quote_number} (${amount})`,
    html: [
      `<p><strong>${escapeHtml(quote.recipient_name)}</strong> ${decision} quote <strong>${escapeHtml(quote.quote_number)}</strong> - ${escapeHtml(quote.title)} - for <strong>${escapeHtml(amount)}</strong>.</p>`,
      note ? `<p><strong>Note from the recipient:</strong> ${escapeHtml(note)}</p>` : '',
    ].join(''),
  }))
  return c.json({ ok: true, status: decision })
})
