import type { Env } from './types'
import { hashPassword, uuid } from './crypto'
import { PORTAL_WWW_LOGIN } from './appUrls'
import {
  PROCESSOR_REVIEW_COMPANY,
  PROCESSOR_REVIEW_EMAIL,
  PROCESSOR_REVIEW_FIRST_NAME,
  PROCESSOR_REVIEW_LAST_NAME,
  PROCESSOR_REVIEW_NAME,
  PROCESSOR_REVIEW_USER_ID,
  generateProcessorReviewPassword,
} from '../../shared/processorReviewLogin'

const ids = {
  profile: 'processor-review-profile',
  property1: 'processor-review-property-1',
  property2: 'processor-review-property-2',
  invoiceOpen: 'processor-review-invoice-open',
  invoicePaid: 'processor-review-invoice-paid',
  invoiceLineOpen: 'processor-review-invoice-line-open',
  invoiceLinePaid: 'processor-review-invoice-line-paid',
  quote: 'processor-review-quote',
  quoteToken: 'processor-review-quote-token',
  quoteLine: 'processor-review-quote-line',
  ticket: 'processor-review-ticket',
  matter: 'processor-review-matter',
  task: 'processor-review-task',
  documentRequest: 'processor-review-doc-request',
  document: 'processor-review-document',
  funding: 'processor-review-funding',
  appointment: 'processor-review-appointment',
  call: 'processor-review-call',
  tax: 'processor-review-tax',
}

export interface ProcessorReviewLoginResult {
  email: string
  password: string
  login_url: string
  user_id: string
  created: boolean
  services: string[]
}

function isoDaysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function isoHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

export async function stageProcessorReviewLogin(env: Env, actorUserId: string): Promise<ProcessorReviewLoginResult> {
  const existing = await env.DB.prepare('SELECT id, role, email FROM users WHERE id = ? OR lower(email) = lower(?)')
    .bind(PROCESSOR_REVIEW_USER_ID, PROCESSOR_REVIEW_EMAIL)
    .first<{ id: string; role: string; email: string }>()

  if (existing && existing.role !== 'client') {
    throw new Error(`cannot stage the processor review login because ${existing.email} is a ${existing.role} account`)
  }

  const userId = existing?.id || PROCESSOR_REVIEW_USER_ID
  const created = !existing
  const password = generateProcessorReviewPassword()
  const passwordHash = await hashPassword(password, env.SESSION_SECRET)

  if (existing) {
    await env.DB.prepare(
      `UPDATE users
       SET email = ?, password_hash = ?, role = 'client', full_name = ?, first_name = ?, last_name = ?,
           two_factor_enabled = 0, status = 'active', tos_accepted_at = COALESCE(tos_accepted_at, datetime('now'))
       WHERE id = ?`,
    ).bind(PROCESSOR_REVIEW_EMAIL, passwordHash, PROCESSOR_REVIEW_NAME, PROCESSOR_REVIEW_FIRST_NAME, PROCESSOR_REVIEW_LAST_NAME, userId).run()
  } else {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status, tos_accepted_at)
       VALUES (?, ?, ?, 'client', ?, ?, ?, '(561) 388-7879', 0, 'active', datetime('now'))`,
    ).bind(userId, PROCESSOR_REVIEW_EMAIL, passwordHash, PROCESSOR_REVIEW_NAME, PROCESSOR_REVIEW_FIRST_NAME, PROCESSOR_REVIEW_LAST_NAME).run()
  }

  const profile = await env.DB.prepare('SELECT id FROM client_profiles WHERE user_id = ?').bind(userId).first<{ id: string }>()
  if (profile) {
    await env.DB.prepare(
      `UPDATE client_profiles
       SET business_name = ?, entity_type = 'LLC', state = 'FL', onboarding_completed = 1
       WHERE user_id = ?`,
    ).bind(PROCESSOR_REVIEW_COMPANY, userId).run()
  } else {
    await env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, business_name, entity_type, state, onboarding_completed)
       VALUES (?, ?, ?, 'LLC', 'FL', 1)`,
    ).bind(ids.profile, userId, PROCESSOR_REVIEW_COMPANY).run()
  }

  const catalog = await env.DB.prepare('SELECT key FROM services WHERE active = 1').all<{ key: string }>()
  const serviceKeys = (catalog.results || []).map((row) => row.key)
  for (const key of serviceKeys) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO client_services (id, client_user_id, service_key, status)
       VALUES (?, ?, ?, 'active')`,
    ).bind(uuid(), userId, key).run()
    await env.DB.prepare(
      `UPDATE client_services SET status = 'active' WHERE client_user_id = ? AND service_key = ?`,
    ).bind(userId, key).run()
  }

  await seedSampleWorkspace(env, userId, actorUserId)

  return {
    email: PROCESSOR_REVIEW_EMAIL,
    password,
    login_url: PORTAL_WWW_LOGIN,
    user_id: userId,
    created,
    services: serviceKeys,
  }
}

async function seedSampleWorkspace(env: Env, userId: string, actorUserId: string) {
  const already = await env.DB.prepare('SELECT id FROM properties WHERE id = ?').bind(ids.property1).first()
  if (already) return

  const openDue = isoDaysFromNow(14)
  const paidIssue = isoDaysFromNow(-21)
  const appointmentStart = isoHoursFromNow(24 * 8)

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO properties (id, client_user_id, address, property_type, status, notes)
       VALUES (?, ?, '1840 Sunrise Blvd, Fort Lauderdale, FL 33304', 'Residential rental', 'active', 'Sample property for processor review. Not a live client file.')`,
    ).bind(ids.property1, userId),
    env.DB.prepare(
      `INSERT INTO properties (id, client_user_id, address, property_type, status, notes)
       VALUES (?, ?, '410 Seabreeze Ave, Delray Beach, FL 33483', 'Small office', 'active', 'Second sample address so the Properties module is not empty.')`,
    ).bind(ids.property2, userId),
    env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, status, due_date,
        invoice_number, customer_number, title, issue_date, message, payment_methods_json,
        subtotal_cents, sent_at, updated_at
      ) VALUES (
        ?, ?, 150000, 'USD', 'open', ?,
        'PMV-REVIEW-1500', 'REVIEW', 'POS / Payments Implementation Coordination', ?,
        'Sample open invoice. Pinnacle records the amount and listed methods; card charging is what this merchant application will enable.',
        ?, 150000, datetime('now'), datetime('now')
      )`,
    ).bind(ids.invoiceOpen, userId, openDue, isoDaysFromNow(0), JSON.stringify(['card', 'ach'])),
    env.DB.prepare(
      `INSERT INTO invoice_line_items (id, invoice_id, name, description, quantity, unit_price_cents, sort_order)
       VALUES (?, ?, 'POS / Payments Implementation Coordination', 'Vendor comparison through cutover and staff training.', 1, 150000, 0)`,
    ).bind(ids.invoiceLineOpen, ids.invoiceOpen),
    env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, status, due_date,
        invoice_number, customer_number, title, issue_date, payment_methods_json,
        subtotal_cents, sent_at, updated_at
      ) VALUES (
        ?, ?, 54900, 'USD', 'paid', ?,
        'PMV-REVIEW-549', 'REVIEW', 'Ops Active monthly plan', ?,
        ?, 54900, datetime('now', '-20 days'), datetime('now')
      )`,
    ).bind(ids.invoicePaid, userId, paidIssue, paidIssue, JSON.stringify(['ach'])),
    env.DB.prepare(
      `INSERT INTO invoice_line_items (id, invoice_id, name, quantity, unit_price_cents, sort_order)
       VALUES (?, ?, 'Ops Active monthly plan', 1, 54900, 0)`,
    ).bind(ids.invoiceLinePaid, ids.invoicePaid),
    env.DB.prepare(
      `INSERT INTO service_quotes (
        id, public_token, quote_number, status, title, client_user_id, service_key,
        recipient_name, recipient_email, recipient_company, intro_message, terms,
        valid_until, subtotal_cents, total_cents, sent_at, viewed_at, created_by_user_id
      ) VALUES (
        ?, ?, 'PMV-Q-REVIEW-1', 'viewed', 'Property Care monthly plan', ?, 'property_management',
        ?, ?, ?, 'Sample quote waiting on a reply. Accept or decline with optional notes. Nothing is charged on the quote page.',
        'This is a processor-review sample. It is not a live customer commitment.',
        ?, 24900, 24900, datetime('now', '-2 days'), datetime('now', '-1 day'), ?
      )`,
    ).bind(ids.quote, ids.quoteToken, userId, PROCESSOR_REVIEW_NAME, PROCESSOR_REVIEW_EMAIL, PROCESSOR_REVIEW_COMPANY, isoDaysFromNow(12), actorUserId),
    env.DB.prepare(
      `INSERT INTO service_quote_line_items (id, quote_id, name, description, quantity, unit_price_cents, sort_order)
       VALUES (?, ?, 'Property Care', 'Monthly oversight with included inspection and service credits.', 1, 24900, 0)`,
    ).bind(ids.quoteLine, ids.quote),
    env.DB.prepare(
      `INSERT INTO support_tickets (id, client_user_id, subject, status, priority, category, details, waiting_on)
       VALUES (?, ?, 'Turnover photos for Sunrise Blvd', 'open', 'normal', 'property', 'Sample request so Cases/Requests is not empty.', 'pinnacle')`,
    ).bind(ids.ticket, userId),
    env.DB.prepare(
      `INSERT INTO matters (id, client_user_id, title, type, status)
       VALUES (?, ?, 'POS cutover coordination', 'project', 'open')`,
    ).bind(ids.matter, userId),
    env.DB.prepare(
      `INSERT INTO client_tasks (id, client_user_id, matter_id, title, status, due_date)
       VALUES (?, ?, ?, 'Send current processor statements', 'pending', ?)`,
    ).bind(ids.task, userId, ids.matter, isoDaysFromNow(5)),
    env.DB.prepare(
      `INSERT INTO document_requests (id, client_user_id, title, signature_required, status)
       VALUES (?, ?, 'W-9 / business formation packet', 0, 'requested')`,
    ).bind(ids.documentRequest, userId),
    env.DB.prepare(
      `INSERT INTO client_documents (id, client_user_id, category, file_name, review_status, visibility, source)
       VALUES (?, ?, 'agreement', 'Sample engagement letter.pdf', 'approved', 'client', 'manual')`,
    ).bind(ids.document, userId),
    env.DB.prepare(
      `INSERT INTO funding_applications (id, client_user_id, amount_requested_cents, use_of_funds, status)
       VALUES (?, ?, 2500000, 'Working capital readiness review only. Pinnacle does not lend or approve funding.', 'submitted')`,
    ).bind(ids.funding, userId),
    env.DB.prepare(
      `INSERT INTO appointments (id, client_user_id, title, starts_at, status)
       VALUES (?, ?, 'Operations check-in', ?, 'scheduled')`,
    ).bind(ids.appointment, userId, appointmentStart),
    env.DB.prepare(
      `INSERT INTO planned_calls (id, client_user_id, topic, status)
       VALUES (?, ?, 'Walk through billing and quotes', 'requested')`,
    ).bind(ids.call, userId),
    env.DB.prepare(
      `INSERT INTO tax_filings (id, client_user_id, tax_year, filing_type, status)
       VALUES (?, ?, 2025, 'information_only', 'not_started')`,
    ).bind(ids.tax, userId),
    env.DB.prepare(
      `INSERT INTO secure_messages (id, client_user_id, sender_user_id, body)
       VALUES (?, ?, ?, 'Welcome to the Pinnacle client workspace. This account is staged for Payment Cloud / Authorize.net review. It is a client login, not HQ.')`,
    ).bind(uuid(), userId, actorUserId),
  ])
}

export async function processorReviewLoginStatus(env: Env) {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.status, u.last_login_at,
            (SELECT COUNT(*) FROM client_services cs WHERE cs.client_user_id = u.id AND cs.status = 'active') AS service_count
     FROM users u
     WHERE u.id = ? OR lower(u.email) = lower(?)
     LIMIT 1`,
  ).bind(PROCESSOR_REVIEW_USER_ID, PROCESSOR_REVIEW_EMAIL).first<{
    id: string
    email: string
    status: string
    last_login_at: string | null
    service_count: number
  }>()

  return {
    exists: !!row,
    email: PROCESSOR_REVIEW_EMAIL,
    login_url: PORTAL_WWW_LOGIN,
    user_id: row?.id || null,
    status: row?.status || null,
    last_login_at: row?.last_login_at || null,
    service_count: row?.service_count || 0,
  }
}
