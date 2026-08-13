import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient, scopeFilter } from '../scope'
import { uuid } from '../crypto'
import { activityInsert, logActivity } from '../activity'
import { sendEmailStrict, escapeHtml } from '../email'
import { renderHqEmailOrFallback } from '../hqEmailTemplates'
import { calculateInvoiceTotals, type InvoiceLineInput } from '../invoiceMath'
import { portalUrl } from '../appUrls'

export const invoiceAdminRoutes = new Hono<AppEnv>()

interface ContactBlock {
  first_name?: string
  last_name?: string
  company?: string
  address_line_1?: string
  address_line_2?: string
  country?: string
  state?: string
  city?: string
  postal_code?: string
  email?: string
  phone?: string
  fax?: string
}

interface ReminderInput {
  days_offset: number
  channel?: string
  enabled?: boolean
}

const CURRENCIES = new Set(['USD', 'CAD', 'MXN', 'AUD', 'EUR', 'GBP', 'SEK', 'PHP', 'NOK', 'DKK', 'JPY', 'RUB', 'PLN', 'INR', 'CNY'])
const DELIVERY = new Set(['email', 'text', 'email_text', 'none'])
const PARTIAL = new Set(['none', 'line_items', 'amount'])
const VAULT = new Set(['none', 'optional', 'required'])
const TX_TYPES = new Set(['sale', 'authorization'])
const PAYMENT_METHODS = new Set(['card', 'apple_pay', 'google_pay', 'ach', 'mail'])
const SEC_CODES = new Set(['PPD', 'CCD', 'WEB'])

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cents(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function contact(value: unknown): ContactBlock {
  if (!value || typeof value !== 'object') return {}
  const row = value as Record<string, unknown>
  return {
    first_name: text(row.first_name, 120),
    last_name: text(row.last_name, 120),
    company: text(row.company, 200),
    address_line_1: text(row.address_line_1, 250),
    address_line_2: text(row.address_line_2, 250),
    country: text(row.country, 120),
    state: text(row.state, 120),
    city: text(row.city, 120),
    postal_code: text(row.postal_code, 30),
    email: text(row.email, 254),
    phone: text(row.phone, 50),
    fax: text(row.fax, 50),
  }
}

function parseJsonObject<T extends object>(raw: string | null | undefined, fallback: T): T {
  try {
    const parsed = JSON.parse(raw || '')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...fallback, ...parsed } : fallback
  } catch {
    return fallback
  }
}

function plusDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)))
  return d.toISOString().slice(0, 10)
}

async function liveInvoiceForQuote(db: D1Database, quoteId: string) {
  return db.prepare(
    `SELECT id, invoice_number, status, amount_cents FROM invoices WHERE quote_id = ? AND status != 'void' ORDER BY created_at DESC LIMIT 1`,
  ).bind(quoteId).first<{ id: string; invoice_number: string | null; status: string; amount_cents: number }>()
}

async function resolveClientForQuote(db: D1Database, quote: { client_user_id?: string | null; recipient_email?: string | null }) {
  if (quote.client_user_id) {
    const linked = await db.prepare("SELECT id FROM users WHERE id = ? AND role = 'client'").bind(quote.client_user_id).first<{ id: string }>()
    if (linked) return linked.id
  }
  const email = text(quote.recipient_email, 200).toLowerCase()
  if (!email) return null
  const match = await db.prepare(
    "SELECT id FROM users WHERE lower(email) = ? AND role = 'client' ORDER BY created_at DESC LIMIT 1",
  ).bind(email).first<{ id: string }>()
  return match?.id || null
}

async function clientDefaults(env: Env, clientId: string) {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.phone,
            cp.business_name, cp.state
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = ? AND u.role = 'client'`,
  ).bind(clientId).first<any>()
  if (!row) return null

  const responses = await env.DB.prepare(
    `SELECT question_key, value FROM client_onboarding_responses
     WHERE client_user_id = ? AND question_key IN
       ('address','address_line_1','address_line_2','city','state','postal_code','zip','country')
     ORDER BY rowid DESC`,
  ).bind(clientId).all<{ question_key: string; value: string }>()

  const prior: Record<string, string> = {}
  for (const response of responses.results ?? []) {
    if (!prior[response.question_key] && response.value) prior[response.question_key] = response.value
  }

  const businessAddress = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'business_address'",
  ).first<{ value: string | null }>()

  const billTo: ContactBlock = {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    company: row.business_name || '',
    address_line_1: prior.address_line_1 || prior.address || '',
    address_line_2: prior.address_line_2 || '',
    country: prior.country || 'United States',
    state: row.state || prior.state || '',
    city: prior.city || '',
    postal_code: prior.postal_code || prior.zip || '',
    email: row.email || '',
    phone: row.phone || '',
  }

  const payableTo: ContactBlock = {
    company: 'Pinnacle Management Ventures',
    address_line_1: businessAddress?.value?.trim() || '',
    country: 'United States',
    email: 'orders@pinnaclemanagementventures.com',
    phone: '(561) 388-7879',
  }

  return { client: row, bill_to: billTo, payable_to: payableTo }
}

invoiceAdminRoutes.get('/invoice-clients', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'u.id')
  const result = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.email, u.phone, cp.business_name
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'client' AND u.status = 'active' AND ${where}
     ORDER BY COALESCE(cp.business_name, u.full_name, u.email)`,
  ).bind(...params).all()
  return c.json({ clients: result.results ?? [] })
})

invoiceAdminRoutes.get('/invoice-clients/:clientId/defaults', requireStaff, async (c) => {
  const user = c.get('user')
  const clientId = c.req.param('clientId') ?? ''
  if (!(await canAccessClient(c.env, user, clientId))) return c.json({ error: 'forbidden' }, 403)
  const defaults = await clientDefaults(c.env, clientId)
  if (!defaults) return c.json({ error: 'client not found' }, 404)
  return c.json(defaults)
})

invoiceAdminRoutes.get('/invoices', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'i.client_user_id')
  const status = c.req.query('status')
  const search = text(c.req.query('q'), 120)
  const clauses = [where]
  const binds: unknown[] = [...params]

  if (status && ['open', 'paid', 'void'].includes(status)) {
    clauses.push('i.status = ?')
    binds.push(status)
  }
  if (search) {
    const q = `%${search.toLowerCase()}%`
    clauses.push(`(
      LOWER(COALESCE(i.invoice_number,'')) LIKE ? OR
      LOWER(COALESCE(i.customer_number,'')) LIKE ? OR
      LOWER(COALESCE(i.title,'')) LIKE ? OR
      LOWER(COALESCE(u.full_name,'')) LIKE ? OR
      LOWER(u.email) LIKE ? OR
      LOWER(COALESCE(cp.business_name,'')) LIKE ? OR
      LOWER(COALESCE(q.quote_number,'')) LIKE ? OR
      LOWER(i.id) LIKE ?
    )`)
    binds.push(q, q, q, q, q, q, q, q)
  }

  const result = await c.env.DB.prepare(
    `SELECT i.*, u.full_name AS client_name, u.email AS client_email, cp.business_name,
            q.quote_number,
            (SELECT COUNT(*) FROM invoice_line_items li WHERE li.invoice_id = i.id) AS line_item_count
     FROM invoices i
     JOIN users u ON u.id = i.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN service_quotes q ON q.id = i.quote_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY CASE WHEN i.status = 'open' THEN 0 ELSE 1 END,
              COALESCE(i.due_date, i.created_at) DESC
     LIMIT 500`,
  ).bind(...binds).all()
  return c.json({ invoices: result.results ?? [] })
})

invoiceAdminRoutes.get('/invoices/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const invoice = await c.env.DB.prepare(
    `SELECT i.*, u.full_name AS client_name, u.email AS client_email, u.phone AS client_phone, cp.business_name,
            q.quote_number
     FROM invoices i
     JOIN users u ON u.id = i.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN service_quotes q ON q.id = i.quote_id
     WHERE i.id = ?`,
  ).bind(c.req.param('id') ?? '').first<any>()
  if (!invoice) return c.json({ error: 'invoice not found' }, 404)
  if (!(await canAccessClient(c.env, user, invoice.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const [lineItems, reminders] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order, created_at').bind(invoice.id).all(),
    c.env.DB.prepare('SELECT * FROM invoice_reminders WHERE invoice_id = ? ORDER BY days_offset DESC').bind(invoice.id).all(),
  ])

  return c.json({
    invoice: {
      ...invoice,
      bill_to: parseJsonObject(invoice.bill_to_json, {}),
      payable_to: parseJsonObject(invoice.payable_to_json, {}),
      payment_methods: JSON.parse(invoice.payment_methods_json || '[]'),
      ach_sec_codes: JSON.parse(invoice.ach_sec_codes_json || '[]'),
    },
    line_items: lineItems.results ?? [],
    reminders: reminders.results ?? [],
  })
})

invoiceAdminRoutes.post('/invoices', requireStaff, async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body?.client_user_id) return c.json({ error: 'client is required' }, 400)
  if (!(await canAccessClient(c.env, actor, body.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const defaults = await clientDefaults(c.env, body.client_user_id)
  if (!defaults) return c.json({ error: 'client not found' }, 404)

  const rawLines: InvoiceLineInput[] = Array.isArray(body.line_items) ? body.line_items : []
  if (rawLines.length === 0) return c.json({ error: 'add at least one line item' }, 400)
  const calculation = calculateInvoiceTotals(rawLines, cents(body.shipping_cents))
  const id = uuid()
  const now = new Date()
  const invoiceNumber = text(body.invoice_number, 80) || `PMV-${now.getUTCFullYear()}-${now.getTime().toString().slice(-7)}`
  const customerNumber = text(body.customer_number, 80) || String(body.client_user_id).slice(0, 8).toUpperCase()
  const currencyInput = String(body.currency || '').toUpperCase()
  const currency = CURRENCIES.has(currencyInput) ? currencyInput : 'USD'
  const deliveryChannel = DELIVERY.has(body.delivery_channel) ? body.delivery_channel : 'email'
  const partialType = PARTIAL.has(body.partial_payment_type) ? body.partial_payment_type : 'none'
  const saveMode = VAULT.has(body.save_customer_mode) ? body.save_customer_mode : 'none'
  const transactionType = TX_TYPES.has(body.transaction_type) ? body.transaction_type : 'sale'
  const paymentMethods = Array.isArray(body.payment_methods)
    ? [...new Set(body.payment_methods.filter((value: unknown) => typeof value === 'string' && PAYMENT_METHODS.has(value)))].slice(0, 10)
    : ['card', 'ach']
  const secCodes = Array.isArray(body.ach_sec_codes)
    ? [...new Set(body.ach_sec_codes.filter((value: unknown) => typeof value === 'string' && SEC_CODES.has(value)))].slice(0, 3)
    : []
  const billTo = { ...defaults.bill_to, ...contact(body.bill_to) }
  const payableTo = { ...defaults.payable_to, ...contact(body.payable_to) }
  const reminders: ReminderInput[] = Array.isArray(body.reminders) ? body.reminders.slice(0, 12) : []
  const quoteId = text(body.quote_id, 100) || null
  if (quoteId) {
    const quote = await c.env.DB.prepare('SELECT id, status FROM service_quotes WHERE id = ?').bind(quoteId).first<{ id: string; status: string }>()
    if (!quote) return c.json({ error: 'quote not found' }, 404)
    if (quote.status !== 'accepted') return c.json({ error: 'only an accepted quote can be linked to an invoice' }, 409)
    const existing = await liveInvoiceForQuote(c.env.DB, quoteId)
    if (existing) return c.json({ error: `this quote already has invoice ${existing.invoice_number || existing.id}`, invoice: existing }, 409)
  }

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, status, due_date,
        invoice_number, customer_number, title, issue_date, bill_to_json, payable_to_json,
        message, custom_field_group, payment_methods_json, card_processor_label,
        transaction_type, ach_processor_label, ach_sec_codes_json, partial_payment_type,
        partial_payment_amount_cents, require_shipping_details, save_customer_mode,
        delivery_channel, additional_emails, send_receipt, subtotal_cents, discount_cents,
        tax_cents, shipping_cents, quote_id, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )`,
    ).bind(
      id,
      body.client_user_id,
      calculation.total,
      currency,
      text(body.due_date, 40) || null,
      invoiceNumber,
      customerNumber,
      text(body.title, 200) || 'Professional services invoice',
      text(body.issue_date, 40) || now.toISOString().slice(0, 10),
      JSON.stringify(billTo),
      JSON.stringify(payableTo),
      text(body.message, 4000) || null,
      text(body.custom_field_group, 120) || null,
      JSON.stringify(paymentMethods),
      text(body.card_processor_label, 120) || null,
      transactionType,
      text(body.ach_processor_label, 120) || null,
      JSON.stringify(secCodes),
      partialType,
      partialType === 'amount' ? cents(body.partial_payment_amount_cents) : null,
      body.require_shipping_details ? 1 : 0,
      saveMode,
      deliveryChannel,
      text(body.additional_emails, 1000) || null,
      body.send_receipt === false ? 0 : 1,
      calculation.subtotal,
      calculation.discount,
      calculation.tax,
      calculation.shipping,
      quoteId,
    ),
    ...calculation.items.map((item) => c.env.DB.prepare(
      `INSERT INTO invoice_line_items (
        id, invoice_id, name, description, quantity, unit_price_cents, discount_cents,
        shipped, taxable, local_tax_rate, national_tax_rate, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), id, item.name, item.description, item.quantity, item.unit_price_cents,
      item.discount_cents, item.shipped, item.taxable, item.local_tax_rate,
      item.national_tax_rate, item.sort_order,
    )),
    ...reminders.map((reminder) => c.env.DB.prepare(
      `INSERT INTO invoice_reminders (id, invoice_id, days_offset, channel, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      uuid(),
      id,
      Math.max(-365, Math.min(365, Math.round(Number(reminder.days_offset) || 0))),
      DELIVERY.has(reminder.channel || '') ? reminder.channel : 'email',
      reminder.enabled === false ? 0 : 1,
    )),
    activityInsert(c.env, {
      actorUserId: actor.id,
      clientUserId: body.client_user_id,
      kind: 'invoice_created',
      detail: {
        invoice_id: id,
        invoice_number: invoiceNumber,
        amount_cents: calculation.total,
        line_items: calculation.items.length,
        quote_id: quoteId,
      },
    }),
  ]

  try {
    await c.env.DB.batch(statements)
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return c.json({ error: 'invoice number already exists' }, 409)
    throw err
  }

  return c.json({ ok: true, id, invoice_number: invoiceNumber, amount_cents: calculation.total }, 201)
})

invoiceAdminRoutes.post('/invoices/from-quote/:quoteId', requireStaff, async (c) => {
  const actor = c.get('user')
  const quoteId = c.req.param('quoteId') ?? ''
  const quote = await c.env.DB.prepare('SELECT * FROM service_quotes WHERE id = ?').bind(quoteId).first<any>()
  if (!quote) return c.json({ error: 'quote not found' }, 404)
  if (quote.status !== 'accepted') return c.json({ error: 'only an accepted quote can be converted to an invoice' }, 409)

  const existing = await liveInvoiceForQuote(c.env.DB, quoteId)
  if (existing) {
    return c.json({ error: `this quote already has invoice ${existing.invoice_number || existing.id}`, invoice: existing }, 409)
  }

  const clientId = await resolveClientForQuote(c.env.DB, quote)
  if (!clientId) {
    return c.json({ error: 'No client account is linked to this quote. Open the client in HQ first, then convert.' }, 400)
  }
  if (!(await canAccessClient(c.env, actor, clientId))) return c.json({ error: 'forbidden' }, 403)

  const defaults = await clientDefaults(c.env, clientId)
  if (!defaults) return c.json({ error: 'client not found' }, 404)

  const quoteLines = await c.env.DB.prepare(
    'SELECT * FROM service_quote_line_items WHERE quote_id = ? ORDER BY sort_order, created_at',
  ).bind(quoteId).all<any>()
  const billable = (quoteLines.results ?? []).filter((line) => !line.is_optional)
  if (!billable.length) return c.json({ error: 'this quote has no billable lines to invoice' }, 400)

  const body = await c.req.json<{ due_days?: number; mark_paid?: boolean; due_date?: string }>().catch(() => ({} as { due_days?: number; mark_paid?: boolean; due_date?: string }))
  const markPaid = body.mark_paid === true
  const dueDate = text(body.due_date, 40) || plusDays(Number.isFinite(Number(body.due_days)) ? Number(body.due_days) : 30)
  const rawLines: InvoiceLineInput[] = billable.map((line) => ({
    name: line.name,
    description: line.description,
    quantity: Number(line.quantity) || 1,
    unit_price_cents: Number(line.unit_price_cents) || 0,
    discount_cents: Number(line.discount_cents) || 0,
  }))
  const calculation = calculateInvoiceTotals(rawLines, 0)
  const id = uuid()
  const now = new Date()
  const invoiceNumber = `PMV-${now.getUTCFullYear()}-${now.getTime().toString().slice(-7)}`
  const customerNumber = String(clientId).slice(0, 8).toUpperCase()
  const billTo = {
    ...defaults.bill_to,
    first_name: defaults.bill_to.first_name || String(quote.recipient_name || '').split(' ')[0] || '',
    last_name: defaults.bill_to.last_name || String(quote.recipient_name || '').split(' ').slice(1).join(' ') || '',
    company: defaults.bill_to.company || quote.recipient_company || '',
    email: defaults.bill_to.email || quote.recipient_email || '',
    phone: defaults.bill_to.phone || quote.recipient_phone || '',
  }
  const status = markPaid ? 'paid' : 'open'
  const message = quote.intro_message
    || `Converted from accepted quote ${quote.quote_number}.`
  const paymentMethods = JSON.stringify(['card', 'ach', 'mail'])

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, status, due_date,
        invoice_number, customer_number, title, issue_date, bill_to_json, payable_to_json,
        message, payment_methods_json, transaction_type, partial_payment_type,
        require_shipping_details, save_customer_mode, delivery_channel, send_receipt,
        subtotal_cents, discount_cents, tax_cents, shipping_cents, quote_id, updated_at
      ) VALUES (
        ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sale', 'none', 0, 'none', 'email', 1,
        ?, ?, ?, 0, ?, datetime('now')
      )`,
    ).bind(
      id,
      clientId,
      calculation.total,
      status,
      dueDate,
      invoiceNumber,
      customerNumber,
      text(quote.title, 200) || 'Professional services invoice',
      now.toISOString().slice(0, 10),
      JSON.stringify(billTo),
      JSON.stringify(defaults.payable_to),
      text(message, 4000) || null,
      paymentMethods,
      calculation.subtotal,
      calculation.discount,
      calculation.tax,
      quoteId,
    ),
    ...calculation.items.map((item) => c.env.DB.prepare(
      `INSERT INTO invoice_line_items (
        id, invoice_id, name, description, quantity, unit_price_cents, discount_cents,
        shipped, taxable, local_tax_rate, national_tax_rate, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), id, item.name, item.description, item.quantity, item.unit_price_cents,
      item.discount_cents, item.shipped, item.taxable, item.local_tax_rate,
      item.national_tax_rate, item.sort_order,
    )),
    c.env.DB.prepare(
      "INSERT INTO invoice_reminders (id, invoice_id, days_offset, channel, enabled) VALUES (?, ?, 7, 'email', 1)",
    ).bind(uuid(), id),
    c.env.DB.prepare(
      "INSERT INTO invoice_reminders (id, invoice_id, days_offset, channel, enabled) VALUES (?, ?, 1, 'email', 1)",
    ).bind(uuid(), id),
    activityInsert(c.env, {
      actorUserId: actor.id,
      clientUserId: clientId,
      kind: 'invoice_created',
      detail: {
        invoice_id: id,
        invoice_number: invoiceNumber,
        amount_cents: calculation.total,
        line_items: calculation.items.length,
        quote_id: quoteId,
        quote_number: quote.quote_number,
        converted: true,
        mark_paid: markPaid,
      },
    }),
    c.env.DB.prepare(
      "INSERT INTO service_quote_events (id, quote_id, kind, actor, detail) VALUES (?, ?, 'updated', ?, ?)",
    ).bind(uuid(), quoteId, `staff:${actor.id}`, markPaid ? `converted to paid invoice ${invoiceNumber}` : `converted to invoice ${invoiceNumber}`),
  ]

  if (!quote.client_user_id) {
    statements.push(c.env.DB.prepare(
      "UPDATE service_quotes SET client_user_id = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(clientId, quoteId))
  }

  try {
    await c.env.DB.batch(statements)
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      const raced = await liveInvoiceForQuote(c.env.DB, quoteId)
      if (raced) return c.json({ error: `this quote already has invoice ${raced.invoice_number || raced.id}`, invoice: raced }, 409)
      return c.json({ error: 'invoice number already exists' }, 409)
    }
    throw err
  }

  return c.json({
    ok: true,
    id,
    invoice_number: invoiceNumber,
    amount_cents: calculation.total,
    status,
    client_user_id: clientId,
  }, 201)
})

invoiceAdminRoutes.patch('/invoices/:id', requireStaff, async (c) => {
  const actor = c.get('user')
  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(c.req.param('id') ?? '')
    .first<any>()
  if (!invoice) return c.json({ error: 'invoice not found' }, 404)
  if (!(await canAccessClient(c.env, actor, invoice.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  if (invoice.status !== 'open') return c.json({ error: 'only an open invoice can be edited' }, 409)

  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value) }
  if (typeof body.title === 'string' && body.title.trim()) add('title', text(body.title, 200))
  if ('invoice_number' in body && text(body.invoice_number, 80)) add('invoice_number', text(body.invoice_number, 80))
  if ('customer_number' in body) add('customer_number', text(body.customer_number, 80) || null)
  if ('issue_date' in body) add('issue_date', text(body.issue_date, 40) || null)
  if ('due_date' in body) add('due_date', text(body.due_date, 40) || null)
  if ('message' in body) add('message', text(body.message, 4000) || null)
  if ('additional_emails' in body) add('additional_emails', text(body.additional_emails, 1000) || null)
  if ('delivery_channel' in body && DELIVERY.has(body.delivery_channel)) add('delivery_channel', body.delivery_channel)
  if ('currency' in body) {
    const currencyInput = String(body.currency || '').toUpperCase()
    add('currency', CURRENCIES.has(currencyInput) ? currencyInput : invoice.currency)
  }
  if (body.bill_to) add('bill_to_json', JSON.stringify({ ...parseJsonObject(invoice.bill_to_json, {}), ...contact(body.bill_to) }))
  if (body.payable_to) add('payable_to_json', JSON.stringify({ ...parseJsonObject(invoice.payable_to_json, {}), ...contact(body.payable_to) }))
  if (Array.isArray(body.payment_methods)) {
    add('payment_methods_json', JSON.stringify([...new Set(body.payment_methods.filter((value: unknown) => typeof value === 'string' && PAYMENT_METHODS.has(value)))].slice(0, 10)))
  }

  const statements: D1PreparedStatement[] = []
  if (Array.isArray(body.line_items)) {
    const rawLines: InvoiceLineInput[] = body.line_items
    if (rawLines.length === 0) return c.json({ error: 'add at least one line item' }, 400)
    const calculation = calculateInvoiceTotals(rawLines, 'shipping_cents' in body ? cents(body.shipping_cents) : Number(invoice.shipping_cents || 0))
    add('amount_cents', calculation.total)
    add('subtotal_cents', calculation.subtotal)
    add('discount_cents', calculation.discount)
    add('tax_cents', calculation.tax)
    add('shipping_cents', calculation.shipping)
    statements.push(c.env.DB.prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?').bind(invoice.id))
    statements.push(...calculation.items.map((item) => c.env.DB.prepare(
      `INSERT INTO invoice_line_items (
        id, invoice_id, name, description, quantity, unit_price_cents, discount_cents,
        shipped, taxable, local_tax_rate, national_tax_rate, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), invoice.id, item.name, item.description, item.quantity, item.unit_price_cents,
      item.discount_cents, item.shipped, item.taxable, item.local_tax_rate,
      item.national_tax_rate, item.sort_order,
    )))
  } else if ('shipping_cents' in body) {
    const shipping = cents(body.shipping_cents)
    const total = Math.max(0, Number(invoice.subtotal_cents || 0) - Number(invoice.discount_cents || 0) + Number(invoice.tax_cents || 0) + shipping)
    add('shipping_cents', shipping)
    add('amount_cents', total)
  }

  if (!sets.length && !statements.length) return c.json({ error: 'nothing to update' }, 400)
  sets.push("updated_at = datetime('now')")
  statements.unshift(c.env.DB.prepare(`UPDATE invoices SET ${sets.join(', ')} WHERE id = ?`).bind(...values, invoice.id))
  statements.push(activityInsert(c.env, {
    actorUserId: actor.id,
    clientUserId: invoice.client_user_id,
    kind: 'invoice_updated',
    detail: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
  }))

  try {
    await c.env.DB.batch(statements)
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return c.json({ error: 'invoice number already exists' }, 409)
    throw err
  }
  return c.json({ ok: true })
})

invoiceAdminRoutes.post('/invoices/:id/duplicate', requireStaff, async (c) => {
  const actor = c.get('user')
  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(c.req.param('id') ?? '')
    .first<any>()
  if (!invoice) return c.json({ error: 'invoice not found' }, 404)
  if (!(await canAccessClient(c.env, actor, invoice.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const [lineItems, reminders] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order, created_at').bind(invoice.id).all<any>(),
    c.env.DB.prepare('SELECT * FROM invoice_reminders WHERE invoice_id = ? ORDER BY days_offset DESC').bind(invoice.id).all<any>(),
  ])
  const lines = (lineItems.results ?? []).map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unit_price_cents: item.unit_price_cents,
    discount_cents: item.discount_cents,
    shipped: !!item.shipped,
    taxable: !!item.taxable,
    local_tax_rate: item.local_tax_rate,
    national_tax_rate: item.national_tax_rate,
  }))
  const calculation = calculateInvoiceTotals(lines, Number(invoice.shipping_cents || 0))
  const id = uuid()
  const now = new Date()
  const invoiceNumber = `PMV-${now.getUTCFullYear()}-${now.getTime().toString().slice(-7)}`

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, status, due_date,
        invoice_number, customer_number, title, issue_date, bill_to_json, payable_to_json,
        message, custom_field_group, payment_methods_json, card_processor_label,
        transaction_type, ach_processor_label, ach_sec_codes_json, partial_payment_type,
        partial_payment_amount_cents, require_shipping_details, save_customer_mode,
        delivery_channel, additional_emails, send_receipt, subtotal_cents, discount_cents,
        tax_cents, shipping_cents, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )`,
    ).bind(
      id,
      invoice.client_user_id,
      calculation.total,
      invoice.currency || 'USD',
      invoice.due_date,
      invoiceNumber,
      invoice.customer_number,
      invoice.title ? `${invoice.title} (copy)` : 'Professional services invoice',
      now.toISOString().slice(0, 10),
      invoice.bill_to_json,
      invoice.payable_to_json,
      invoice.message,
      invoice.custom_field_group,
      invoice.payment_methods_json,
      invoice.card_processor_label,
      invoice.transaction_type || 'sale',
      invoice.ach_processor_label,
      invoice.ach_sec_codes_json,
      invoice.partial_payment_type || 'none',
      invoice.partial_payment_amount_cents,
      invoice.require_shipping_details ? 1 : 0,
      invoice.save_customer_mode || 'none',
      invoice.delivery_channel || 'email',
      invoice.additional_emails,
      invoice.send_receipt === 0 ? 0 : 1,
      calculation.subtotal,
      calculation.discount,
      calculation.tax,
      calculation.shipping,
    ),
    ...calculation.items.map((item) => c.env.DB.prepare(
      `INSERT INTO invoice_line_items (
        id, invoice_id, name, description, quantity, unit_price_cents, discount_cents,
        shipped, taxable, local_tax_rate, national_tax_rate, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), id, item.name, item.description, item.quantity, item.unit_price_cents,
      item.discount_cents, item.shipped, item.taxable, item.local_tax_rate,
      item.national_tax_rate, item.sort_order,
    )),
    ...(reminders.results ?? []).map((reminder) => c.env.DB.prepare(
      `INSERT INTO invoice_reminders (id, invoice_id, days_offset, channel, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(uuid(), id, reminder.days_offset, reminder.channel || 'email', reminder.enabled === 0 ? 0 : 1)),
    activityInsert(c.env, {
      actorUserId: actor.id,
      clientUserId: invoice.client_user_id,
      kind: 'invoice_created',
      detail: { invoice_id: id, invoice_number: invoiceNumber, duplicated_from: invoice.id, amount_cents: calculation.total },
    }),
  ]

  try {
    await c.env.DB.batch(statements)
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return c.json({ error: 'invoice number already exists' }, 409)
    throw err
  }
  return c.json({ ok: true, id, invoice_number: invoiceNumber, amount_cents: calculation.total }, 201)
})

invoiceAdminRoutes.patch('/invoices/:id/status', requireStaff, async (c) => {
  const actor = c.get('user')
  const invoice = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?')
    .bind(c.req.param('id') ?? '')
    .first<any>()
  if (!invoice) return c.json({ error: 'invoice not found' }, 404)
  if (!(await canAccessClient(c.env, actor, invoice.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const nextStatus = body.status && ['open', 'paid', 'void'].includes(body.status) ? body.status : null
  if (!nextStatus) return c.json({ error: 'invalid status' }, 400)

  await c.env.DB.prepare(
    `UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(nextStatus, invoice.id).run()

  if (nextStatus !== invoice.status) {
    await logActivity(c.env, {
      actorUserId: actor.id,
      clientUserId: invoice.client_user_id,
      kind: 'invoice_status_changed',
      detail: {
        invoice_number: invoice.invoice_number,
        amount_cents: invoice.amount_cents,
        from: invoice.status,
        to: nextStatus,
      },
    })
  }
  return c.json({ ok: true })
})

invoiceAdminRoutes.post('/invoices/:id/send', requireStaff, async (c) => {
  const actor = c.get('user')
  const invoice = await c.env.DB.prepare(
    `SELECT i.*, u.email AS client_email, u.full_name AS client_name
     FROM invoices i JOIN users u ON u.id = i.client_user_id
     WHERE i.id = ?`,
  ).bind(c.req.param('id') ?? '').first<any>()
  if (!invoice) return c.json({ error: 'invoice not found' }, 404)
  if (!(await canAccessClient(c.env, actor, invoice.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const channel = invoice.delivery_channel || 'email'
  if (channel === 'none') return c.json({ error: 'invoice delivery is set to none' }, 409)
  if (channel === 'text') {
    return c.json({ error: 'SMS invoice delivery is not connected yet; change delivery to email or email + text.' }, 409)
  }

  const recipients = [
    invoice.client_email,
    ...String(invoice.additional_emails || '').split(',').map((email) => email.trim()),
  ].filter((email, index, all) => email && email.includes('@') && all.indexOf(email) === index).slice(0, 20)
  if (recipients.length === 0) return c.json({ error: 'no valid invoice email recipient is available' }, 409)

  const amount = `${String(invoice.currency || 'USD').toUpperCase()} ${(Number(invoice.amount_cents || 0) / 100).toFixed(2)}`
  const due = invoice.due_date
    ? new Date(`${String(invoice.due_date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US')
    : 'upon receipt'
  const invoiceLabel = invoice.invoice_number || invoice.id
  const portalUrlValue = portalUrl('/billing')
  const fallbackSubject = `${invoiceLabel} - ${amount}`
  const fallbackHtml = [
    `<p>Hi ${escapeHtml(invoice.client_name || 'there')},</p>`,
    `<p>Pinnacle Management Ventures has prepared invoice <strong>${escapeHtml(invoiceLabel)}</strong> for <strong>${escapeHtml(amount)}</strong>, due ${escapeHtml(due)}.</p>`,
    invoice.message ? `<p>${escapeHtml(invoice.message)}</p>` : '',
    `<p><a href="${portalUrlValue}">View invoice in your Client Portal</a></p>`,
    '<p>This invoice records the amount and available payment methods. Online card/ACH charging is not enabled in Pinnacle at this time.</p>',
  ].join('')
  const rendered = await renderHqEmailOrFallback(c.env, 'invoice_send', {
    first_name: String(invoice.client_name || 'there').trim().split(/\s+/)[0] || 'there',
    invoice_label: String(invoiceLabel),
    amount,
    due,
    invoice_message: invoice.message ? String(invoice.message) : '',
    action_url: portalUrlValue,
  }, {
    subject: fallbackSubject,
    html: fallbackHtml,
    text: `Pinnacle invoice ${invoiceLabel}: ${amount}, due ${due}. View it at ${portalUrlValue}`,
  })
  const subject = rendered.subject
  const html = rendered.html

  try {
    const sendStamp = new Date().toISOString().slice(0, 16)
    const providerIds = await Promise.all(recipients.map((to) => sendEmailStrict(c.env, {
      to,
      subject,
      html,
      text: rendered.text || `Pinnacle invoice ${invoiceLabel}: ${amount}, due ${due}. View it at ${portalUrlValue}`,
      replyTo: 'orders@pinnaclemanagementventures.com',
      idempotencyKey: `invoice/${invoice.id}/${to}/${sendStamp}`,
      tags: [
        { name: 'type', value: 'invoice' },
        { name: 'invoice', value: String(invoiceLabel).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256) },
      ],
    })))

    await c.env.DB.prepare(
      `UPDATE invoices SET sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).bind(invoice.id).run()
    await logActivity(c.env, {
      actorUserId: actor.id,
      clientUserId: invoice.client_user_id,
      kind: 'invoice_sent',
      detail: { invoice_number: invoice.invoice_number, recipients: recipients.length, provider_ids: providerIds },
    })

    return c.json({
      ok: true,
      recipients: recipients.length,
      sms_requested_but_not_connected: channel === 'email_text',
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'could not send invoice' }, 502)
  }
})
