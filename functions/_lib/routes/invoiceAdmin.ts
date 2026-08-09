import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient, scopeFilter } from '../scope'
import { uuid } from '../crypto'
import { activityInsert, logActivity } from '../activity'
import { sendEmailStrict, escapeHtml } from '../email'
import { calculateInvoiceTotals, type InvoiceLineInput } from '../invoiceMath'

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
      LOWER(COALESCE(i.title,'')) LIKE ? OR
      LOWER(COALESCE(u.full_name,'')) LIKE ? OR
      LOWER(u.email) LIKE ? OR
      LOWER(COALESCE(cp.business_name,'')) LIKE ?
    )`)
    binds.push(q, q, q, q, q)
  }

  const result = await c.env.DB.prepare(
    `SELECT i.*, u.full_name AS client_name, u.email AS client_email, cp.business_name,
            (SELECT COUNT(*) FROM invoice_line_items li WHERE li.invoice_id = i.id) AS line_item_count
     FROM invoices i
     JOIN users u ON u.id = i.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
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
    `SELECT i.*, u.full_name AS client_name, u.email AS client_email, u.phone AS client_phone, cp.business_name
     FROM invoices i
     JOIN users u ON u.id = i.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
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
  const portalUrl = 'https://client.pinnaclemanagementventures.com/billing'
  const subject = `${invoiceLabel} — ${amount}`
  const html = [
    `<p>Hi ${escapeHtml(invoice.client_name || 'there')},</p>`,
    `<p>Pinnacle Management Ventures has prepared invoice <strong>${escapeHtml(invoiceLabel)}</strong> for <strong>${escapeHtml(amount)}</strong>, due ${escapeHtml(due)}.</p>`,
    invoice.message ? `<p>${escapeHtml(invoice.message)}</p>` : '',
    `<p><a href="${portalUrl}">View invoice in your Client Portal</a></p>`,
    '<p>This invoice records the amount and available payment methods. Online card/ACH charging is not enabled in Pinnacle at this time.</p>',
  ].join('')

  try {
    const sendStamp = new Date().toISOString().slice(0, 16)
    const providerIds = await Promise.all(recipients.map((to) => sendEmailStrict(c.env, {
      to,
      subject,
      html,
      text: `Pinnacle invoice ${invoiceLabel}: ${amount}, due ${due}. View it at ${portalUrl}`,
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
