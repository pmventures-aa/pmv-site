import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireClient, requireUser } from '../mid'
import { uuid, encryptSensitive } from '../crypto'
import { activityInsert } from '../activity'
import { auditInsert, logAudit, actorIp, actorUserAgent } from '../auditLog'
import { notifyStaff, escapeHtml } from '../email'
import { canAccessClient, scopeFilter } from '../scope'
import {
  answerForStorage,
  answerFromStorage,
  displayAnswer,
  missingRequiredQuestions,
  normalizeAnswer,
  type AnswerMap,
  type IntakeQuestion,
  type IntakeValue,
} from '../intake'
import { renderApplicationPdf, type ApplicationPdfAnswer } from '../applicationPdf'
import { advanceInquiryLifecycle } from '../lifecycle'

export const serviceApplicationRoutes = new Hono<AppEnv>()

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_FILES_PER_APPLICATION = 30
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const BANKING_SERVICES = new Set(['merchant_services', 'funding'])
const APPLICATION_STATUSES = ['submitted', 'in_review', 'approved', 'declined', 'closed']

export interface ServiceRow {
  key: string
  name: string
  description: string | null
  category: string | null
  intake_intro: string | null
  estimated_minutes: number
}

export interface ApplicationRow {
  id: string
  client_user_id: string
  service_key: string
  status: string
  current_step: number
  submission_source: string
  assigned_rep_user_id: string | null
  is_unassigned: number
  may_require_attorney_coordination: number
  pdf_document_id: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

interface AnswerRow {
  id: string
  application_id: string
  question_id: string | null
  question_key: string
  question_label: string
  step_label: string | null
  step_order: number
  sort_order: number
  value_json: string
}

interface AttachmentRow {
  id: string
  document_id: string
  question_key: string | null
  file_name: string | null
  content_type: string | null
  size_bytes: number | null
  visibility: string
  created_at: string
}

function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._() -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'upload'
}

export async function getService(env: Env, key: string): Promise<ServiceRow | null> {
  return env.DB.prepare(
    `SELECT key, name, description, category, intake_intro, estimated_minutes
     FROM services WHERE key = ? AND active = 1`,
  ).bind(key).first<ServiceRow>()
}

export async function getQuestions(env: Env, serviceKey: string): Promise<IntakeQuestion[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order`,
  ).bind(serviceKey).all<IntakeQuestion>()
  return res.results ?? []
}

async function getAnswerRows(env: Env, applicationId: string): Promise<AnswerRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM service_application_answers
     WHERE application_id = ? ORDER BY step_order, sort_order`,
  ).bind(applicationId).all<AnswerRow>()
  return res.results ?? []
}

function rowsToAnswerMap(rows: AnswerRow[]): AnswerMap {
  const map: AnswerMap = {}
  for (const row of rows) map[row.question_key] = answerFromStorage(row.value_json)
  return map
}

async function getAttachments(env: Env, applicationId: string, includeInternal = false): Promise<AttachmentRow[]> {
  const res = await env.DB.prepare(
    `SELECT saa.id, saa.document_id, saa.question_key, d.file_name, d.content_type,
            d.size_bytes, d.visibility, d.created_at
     FROM service_application_attachments saa
     JOIN client_documents d ON d.id = saa.document_id
     WHERE saa.application_id = ? ${includeInternal ? '' : "AND d.visibility != 'internal'"}
     ORDER BY d.created_at ASC`,
  ).bind(applicationId).all<AttachmentRow>()
  return res.results ?? []
}

async function ownedDraft(env: Env, clientId: string, applicationId: string): Promise<ApplicationRow | null> {
  return env.DB.prepare(
    `SELECT * FROM service_applications WHERE id = ? AND client_user_id = ? AND status = 'draft'`,
  ).bind(applicationId, clientId).first<ApplicationRow>()
}

export async function persistAnswers(
  env: Env,
  application: ApplicationRow,
  questions: IntakeQuestion[],
  incoming: Record<string, unknown>,
  currentStep?: number,
): Promise<void> {
  const byKey = new Map(questions.map((q) => [q.question_key, q]))
  const stmts: D1PreparedStatement[] = []
  for (const [questionKey, raw] of Object.entries(incoming).slice(0, 250)) {
    const q = byKey.get(questionKey)
    if (!q || q.input_type === 'file') continue
    const value = normalizeAnswer(raw)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO service_application_answers
          (id, application_id, question_id, question_key, question_label, step_label, step_order, sort_order, value_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(application_id, question_key) DO UPDATE SET
           question_id = excluded.question_id,
           question_label = excluded.question_label,
           step_label = excluded.step_label,
           step_order = excluded.step_order,
           sort_order = excluded.sort_order,
           value_json = excluded.value_json,
           updated_at = datetime('now')`,
      ).bind(
        uuid(),
        application.id,
        q.id,
        q.question_key,
        q.label,
        q.step_label ?? null,
        q.step_order,
        q.sort_order,
        answerForStorage(value),
      ),
    )
  }
  stmts.push(
    env.DB.prepare(
      `UPDATE service_applications
       SET current_step = COALESCE(?, current_step), updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(typeof currentStep === 'number' ? Math.max(0, Math.min(currentStep, 999)) : null, application.id),
  )
  await env.DB.batch(stmts)
}

export function prefillForQuestions(user: SessionUser, profile: any, questions: IntakeQuestion[]): AnswerMap {
  const result: AnswerMap = {}
  const fullName = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || ''
  const businessName = profile?.business_name || ''
  const phone = profile?.phone || ''
  const known: Record<string, string> = {
    name: fullName,
    full_name: fullName,
    owner_name: fullName,
    contact_name: fullName,
    email: user.email,
    contact_email: user.email,
    phone,
    contact_phone: phone,
    business_name: businessName,
    legal_business_name: businessName,
    contact_detail: user.email,
  }
  for (const q of questions) {
    const value = known[q.question_key]
    if (value) result[q.question_key] = value
  }
  return result
}

async function clientProfileBundle(env: Env, user: SessionUser) {
  const profile = await env.DB.prepare(
    `SELECT cp.*, u.phone FROM client_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.user_id = ?`,
  ).bind(user.id).first<any>()
  return {
    name: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
    email: user.email,
    phone: profile?.phone ?? null,
    business_name: profile?.business_name ?? null,
    profile,
  }
}

async function assignmentRouting(env: Env, clientId: string) {
  const res = await env.DB.prepare(
    `SELECT sa.staff_user_id, sa.is_primary, u.full_name, u.email
     FROM staff_assignments sa
     JOIN users u ON u.id = sa.staff_user_id
     WHERE sa.client_user_id = ?
     ORDER BY sa.is_primary DESC, sa.created_at ASC`,
  ).bind(clientId).all<{ staff_user_id: string; is_primary: number; full_name: string | null; email: string }>()
  const assignments = res.results ?? []
  const explicitPrimary = assignments.find((a) => a.is_primary === 1)
  const primary = explicitPrimary ?? (assignments.length === 1 ? assignments[0] : null)
  return {
    assignments,
    primary,
    staffUserIds: primary ? [primary.staff_user_id] : assignments.map((a) => a.staff_user_id),
    unassigned: assignments.length === 0,
  }
}

async function setting(env: Env, key: string, fallback: string): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string | null }>()
  return row?.value || fallback
}

async function tryLogo(requestUrl: string): Promise<ArrayBuffer | null> {
  try {
    const url = new URL('/logo-crest.png', requestUrl)
    const res = await fetch(url.toString(), { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

function attorneyFlag(serviceKey: string, answers: AnswerMap): boolean {
  if (serviceKey !== 'property_management') return false
  const eviction = answers.eviction_help_now
  if (typeof eviction === 'string' && eviction !== 'No / just exploring') return true
  const scope = answers.eviction_scope_requested
  return Array.isArray(scope) && scope.length > 0
}

async function storeBankingIfProvided(env: Env, clientId: string, serviceKey: string, banking: any): Promise<void> {
  if (!banking || !BANKING_SERVICES.has(serviceKey)) return
  const holder = typeof banking.account_holder_name === 'string' ? banking.account_holder_name.trim() : ''
  const routing = typeof banking.routing_number === 'string' ? banking.routing_number.replace(/\D/g, '') : ''
  const account = typeof banking.account_number === 'string' ? banking.account_number.replace(/\s/g, '') : ''
  if (!holder && !routing && !account) return
  if (!holder || !/^\d{9}$/.test(routing) || !account) throw new Error('BANKING_INCOMPLETE')
  const [routingEnc, accountEnc] = await Promise.all([
    encryptSensitive(routing, env.PAYMENT_ENCRYPTION_KEY),
    encryptSensitive(account, env.PAYMENT_ENCRYPTION_KEY),
  ])
  await env.DB.prepare(
    `INSERT INTO client_payment_methods
      (id, client_user_id, service_key, method_type, account_holder_name, bank_name, account_type,
       routing_number_enc, account_number_enc, account_last4)
     VALUES (?, ?, ?, 'ach', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(),
    clientId,
    serviceKey,
    holder.slice(0, 200),
    typeof banking.bank_name === 'string' ? banking.bank_name.trim().slice(0, 200) || null : null,
    typeof banking.account_type === 'string' ? banking.account_type.slice(0, 30) : null,
    routingEnc,
    accountEnc,
    account.slice(-4),
  ).run()
}

// Start or resume the one active draft for a service.
serviceApplicationRoutes.post('/service-applications/:serviceKey/start', requireClient, async (c) => {
  const user = c.get('user')
  const serviceKey = c.req.param('serviceKey') ?? ''
  const service = await getService(c.env, serviceKey)
  if (!service) return c.json({ error: 'unknown service' }, 404)

  let application = await c.env.DB.prepare(
    `SELECT * FROM service_applications
     WHERE client_user_id = ? AND service_key = ? AND status = 'draft'
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(user.id, serviceKey).first<ApplicationRow>()

  if (!application) {
    const id = uuid()
    await c.env.DB.prepare(
      `INSERT INTO service_applications (id, client_user_id, service_key, status, current_step)
       VALUES (?, ?, ?, 'draft', 0)`,
    ).bind(id, user.id, serviceKey).run()
    application = await c.env.DB.prepare('SELECT * FROM service_applications WHERE id = ?').bind(id).first<ApplicationRow>()
    await advanceInquiryLifecycle(c.env, { userId: user.id, email: user.email, target: 'opportunity' })
  }
  if (!application) return c.json({ error: 'could not start application' }, 500)

  const [questions, answerRows, attachments, client] = await Promise.all([
    getQuestions(c.env, serviceKey),
    getAnswerRows(c.env, application.id),
    getAttachments(c.env, application.id),
    clientProfileBundle(c.env, user),
  ])
  return c.json({
    application,
    service,
    questions,
    answers: rowsToAnswerMap(answerRows),
    prefill: prefillForQuestions(user, client.profile, questions),
    attachments,
    client: { name: client.name, email: client.email, phone: client.phone, business_name: client.business_name },
    banking_supported: BANKING_SERVICES.has(serviceKey),
  })
})

// Autosave answers + progress for an existing draft.
serviceApplicationRoutes.patch('/service-applications/:id', requireClient, async (c) => {
  const user = c.get('user')
  const application = await ownedDraft(c.env, user.id, c.req.param('id') ?? '')
  if (!application) return c.json({ error: 'draft application not found' }, 404)
  const body = await c.req.json<{ answers?: Record<string, unknown>; current_step?: number }>().catch(() => ({} as { answers?: Record<string, unknown>; current_step?: number }))
  const questions = await getQuestions(c.env, application.service_key)
  await persistAnswers(c.env, application, questions, body.answers ?? {}, body.current_step)
  return c.json({ ok: true, saved_at: new Date().toISOString() })
})

// Upload one client-supplied file to the existing UPLOADS R2 bucket and link it
// to both the client document record and the application/question.
serviceApplicationRoutes.post('/service-applications/:id/files/:questionKey', requireClient, async (c) => {
  const user = c.get('user')
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const application = await ownedDraft(c.env, user.id, c.req.param('id') ?? '')
  if (!application) return c.json({ error: 'draft application not found' }, 404)
  const questionKey = c.req.param('questionKey') ?? ''
  const question = await c.env.DB.prepare(
    `SELECT * FROM onboarding_questions WHERE service_key = ? AND question_key = ? AND input_type = 'file'`,
  ).bind(application.service_key, questionKey).first<IntakeQuestion>()
  if (!question) return c.json({ error: 'file upload is not valid for this question' }, 400)

  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM service_application_attachments saa
     JOIN client_documents d ON d.id = saa.document_id
     WHERE saa.application_id = ? AND d.visibility != 'internal'`,
  ).bind(application.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_FILES_PER_APPLICATION) return c.json({ error: 'too many files on this application' }, 400)
  if (!question.allow_multiple && (count?.n ?? 0) > 0) {
    const existingForQuestion = await c.env.DB.prepare(
      `SELECT COUNT(*) n FROM service_application_attachments WHERE application_id = ? AND question_key = ?`,
    ).bind(application.id, questionKey).first<{ n: number }>()
    if ((existingForQuestion?.n ?? 0) > 0) return c.json({ error: 'this question accepts one file' }, 400)
  }

  const contentType = (c.req.header('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) return c.json({ error: 'unsupported file type' }, 400)
  const body = await c.req.raw.arrayBuffer()
  if (body.byteLength === 0) return c.json({ error: 'empty upload' }, 400)
  if (body.byteLength > MAX_FILE_BYTES) return c.json({ error: 'file is too large — 20MB max' }, 413)
  const originalName = safeFileName(c.req.header('X-File-Name') || 'upload')
  const docId = uuid()
  const linkId = uuid()
  const objectKey = `client-documents/${user.id}/applications/${application.id}/${docId}-${originalName}`

  await c.env.UPLOADS.put(objectKey, body, {
    httpMetadata: { contentType },
    customMetadata: { originalName, applicationId: application.id, questionKey },
  })

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO client_documents
          (id, client_user_id, category, file_name, r2_key, review_status, visibility, content_type, size_bytes, source, uploaded_by_user_id)
         VALUES (?, ?, 'service_application_attachment', ?, ?, 'pending', 'client', ?, ?, 'service_application_upload', ?)`,
      ).bind(docId, user.id, originalName, objectKey, contentType, body.byteLength, user.id),
      c.env.DB.prepare(
        `INSERT INTO service_application_attachments (id, application_id, document_id, question_key)
         VALUES (?, ?, ?, ?)`,
      ).bind(linkId, application.id, docId, questionKey),
      c.env.DB.prepare(`UPDATE service_applications SET updated_at = datetime('now') WHERE id = ?`).bind(application.id),
    ])
  } catch (err) {
    await c.env.UPLOADS.delete(objectKey).catch(() => {})
    throw err
  }

  const files = await getAttachments(c.env, application.id)
  const names = files.filter((f) => f.question_key === questionKey).map((f) => f.file_name || 'Uploaded file')
  await c.env.DB.prepare(
    `INSERT INTO service_application_answers
      (id, application_id, question_id, question_key, question_label, step_label, step_order, sort_order, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(application_id, question_key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`,
  ).bind(uuid(), application.id, question.id, question.question_key, question.label, question.step_label ?? null, question.step_order, question.sort_order, answerForStorage(names)).run()

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    action: 'file_uploaded',
    entityType: 'client_document',
    entityId: docId,
    after: { application_id: application.id, question_key: questionKey, file_name: originalName, size_bytes: body.byteLength },
  })
  return c.json({ ok: true, document: files.find((f) => f.document_id === docId) }, 201)
})

serviceApplicationRoutes.delete('/service-applications/:id/files/:documentId', requireClient, async (c) => {
  const user = c.get('user')
  const application = await ownedDraft(c.env, user.id, c.req.param('id') ?? '')
  if (!application) return c.json({ error: 'draft application not found' }, 404)
  const row = await c.env.DB.prepare(
    `SELECT d.id, d.r2_key, saa.question_key
     FROM service_application_attachments saa
     JOIN client_documents d ON d.id = saa.document_id
     WHERE saa.application_id = ? AND d.id = ? AND d.client_user_id = ? AND d.visibility != 'internal'`,
  ).bind(application.id, c.req.param('documentId') ?? '', user.id).first<{ id: string; r2_key: string | null; question_key: string | null }>()
  if (!row) return c.json({ error: 'file not found' }, 404)
  if (row.r2_key && c.env.UPLOADS) await c.env.UPLOADS.delete(row.r2_key).catch(() => {})
  await c.env.DB.prepare('DELETE FROM client_documents WHERE id = ?').bind(row.id).run()
  if (row.question_key) {
    const files = await getAttachments(c.env, application.id)
    const names = files.filter((f) => f.question_key === row.question_key).map((f) => f.file_name || 'Uploaded file')
    await c.env.DB.prepare(
      `UPDATE service_application_answers SET value_json = ?, updated_at = datetime('now')
       WHERE application_id = ? AND question_key = ?`,
    ).bind(answerForStorage(names), application.id, row.question_key).run()
  }
  return c.json({ ok: true })
})

// Final submit: validates branching, produces the internal PDF, enrolls the
// client/service, routes the notification, and writes compliance-grade audit events.
serviceApplicationRoutes.post('/service-applications/:id/submit', requireClient, async (c) => {
  const user = c.get('user')
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const application = await ownedDraft(c.env, user.id, c.req.param('id') ?? '')
  if (!application) return c.json({ error: 'draft application not found' }, 404)
  const service = await getService(c.env, application.service_key)
  if (!service) return c.json({ error: 'service is unavailable' }, 404)
  const body = await c.req.json<{ answers?: Record<string, unknown>; current_step?: number; banking?: unknown; signed_name?: string; signature_ack?: boolean }>().catch(() => ({} as { answers?: Record<string, unknown>; current_step?: number; banking?: unknown; signed_name?: string; signature_ack?: boolean }))
  const questions = await getQuestions(c.env, application.service_key)
  if (body.answers) await persistAnswers(c.env, application, questions, body.answers, body.current_step)

  const answerRows = await getAnswerRows(c.env, application.id)
  const answers = rowsToAnswerMap(answerRows)
  const missing = missingRequiredQuestions(questions, answers)
    .filter((q) => !(q.input_type === 'file' && Array.isArray(answers[q.question_key]) && (answers[q.question_key] as string[]).length > 0))
  const acknowledgementMissing = questions.filter(
    (q) => q.question_key.endsWith('_ack') && q.required && answers[q.question_key] !== true,
  )
  const missingKeys = [...new Set([...missing, ...acknowledgementMissing].map((q) => q.question_key))]
  if (missingKeys.length > 0) return c.json({ error: 'missing required answers', missing: missingKeys }, 400)

  const signedName = typeof body.signed_name === 'string' ? body.signed_name.trim() : ''
  if (signedName.length < 2 || body.signature_ack !== true) {
    return c.json({ error: 'type your full name and confirm the certification statement to submit' }, 400)
  }

  try {
    await storeBankingIfProvided(c.env, user.id, application.service_key, body.banking)
  } catch (err) {
    if (err instanceof Error && err.message === 'BANKING_INCOMPLETE') return c.json({ error: 'banking info is incomplete or invalid' }, 400)
    throw err
  }

  const [client, routing, attachments, disclaimer, evictionDisclaimer, contactLine, logoBytes] = await Promise.all([
    clientProfileBundle(c.env, user),
    assignmentRouting(c.env, user.id),
    getAttachments(c.env, application.id),
    setting(c.env, 'service_application_disclaimer', 'Pinnacle Management Ventures provides professional support subject to review and a final written service agreement.'),
    setting(c.env, 'eviction_scope_disclaimer', 'Eviction-related work is subject to legal and scope review and may require attorney coordination.'),
    setting(c.env, 'service_application_contact_line', 'Pinnacle Management Ventures | pinnaclemanagementventures.com'),
    tryLogo(c.req.url),
  ])

  const mayRequireAttorney = attorneyFlag(application.service_key, answers)
  const submittedAt = new Date().toISOString()
  const pdfAnswers: ApplicationPdfAnswer[] = answerRows.map((row) => ({
    question_key: row.question_key,
    question_label: row.question_label,
    step_label: row.step_label,
    step_order: row.step_order,
    sort_order: row.sort_order,
    value: answerFromStorage(row.value_json),
  }))
  const pdfBytes = await renderApplicationPdf({
    applicationId: application.id,
    submittedAt,
    serviceName: service.name,
    client: {
      name: client.name,
      businessName: client.business_name,
      email: client.email,
      phone: client.phone,
    },
    answers: pdfAnswers,
    attachments: attachments.map((a) => ({ file_name: a.file_name })),
    assignedRep: routing.primary?.full_name || routing.primary?.email || (routing.assignments.length > 1 ? 'Assigned team' : null),
    pipelineStage: 'Submitted',
    submissionSource: application.submission_source,
    disclaimer,
    contactLine,
    evictionDisclaimer,
    mayRequireAttorneyCoordination: mayRequireAttorney,
    logoBytes,
    signature: { name: signedName, signedAt: submittedAt, ip: actorIp(c.req.raw) || 'unknown' },
  })

  const pdfDocumentId = uuid()
  const pdfLinkId = uuid()
  const pdfFileName = `Application for Services - ${safeFileName(service.name)} - ${submittedAt.slice(0, 10)}.pdf`
  const pdfKey = `client-documents/${user.id}/applications/${application.id}/${pdfDocumentId}-application.pdf`
  await c.env.UPLOADS.put(pdfKey, pdfBytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { applicationId: application.id, visibility: 'internal', generated: 'true' },
  })

  const ip = actorIp(c.req.raw)
  const ua = actorUserAgent(c.req.raw)
  const mirrorAnswers = answerRows.map((row) =>
    c.env.DB.prepare(
      `INSERT INTO client_onboarding_responses (id, client_user_id, service_key, question_key, value)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(client_user_id, service_key, question_key) DO UPDATE SET value = excluded.value`,
    ).bind(uuid(), user.id, application.service_key, row.question_key, displayAnswer(answerFromStorage(row.value_json))),
  )

  const activityDetail = {
    client_user_id: user.id,
    service_key: application.service_key,
    service_name: service.name,
    application_id: application.id,
    unassigned: routing.unassigned,
    may_require_attorney_coordination: mayRequireAttorney,
  }

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO client_documents
          (id, client_user_id, category, file_name, r2_key, review_status, visibility, content_type, size_bytes, source, uploaded_by_user_id)
         VALUES (?, ?, 'service_application', ?, ?, 'internal', 'internal', 'application/pdf', ?, 'generated_service_application', ?)`,
      ).bind(pdfDocumentId, user.id, pdfFileName, pdfKey, pdfBytes.byteLength, user.id),
      c.env.DB.prepare(
        `INSERT INTO service_application_attachments (id, application_id, document_id, question_key)
         VALUES (?, ?, ?, '__generated_application_pdf__')`,
      ).bind(pdfLinkId, application.id, pdfDocumentId),
      c.env.DB.prepare(
        `UPDATE service_applications SET status = 'submitted', current_step = ?, assigned_rep_user_id = ?,
           is_unassigned = ?, may_require_attorney_coordination = ?, pdf_document_id = ?, submitted_at = ?,
           signed_name = ?, signed_at = ?, signed_ip = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'draft'`,
      ).bind(
        body.current_step ?? application.current_step, routing.primary?.staff_user_id ?? null, routing.unassigned ? 1 : 0,
        mayRequireAttorney ? 1 : 0, pdfDocumentId, submittedAt, signedName, submittedAt, ip, application.id,
      ),
      c.env.DB.prepare(
        `INSERT INTO client_services (id, client_user_id, service_key, status)
         VALUES (?, ?, ?, 'submitted')
         ON CONFLICT(client_user_id, service_key) DO UPDATE SET
           status = CASE WHEN client_services.status IN ('requested','submitted','declined') THEN 'submitted' ELSE client_services.status END`,
      ).bind(uuid(), user.id, application.service_key),
      ...mirrorAnswers,
      activityInsert(c.env, {
        actorUserId: user.id,
        clientUserId: routing.unassigned ? null : user.id,
        recipientUserId: routing.primary?.staff_user_id ?? null,
        kind: 'service_application_submitted',
        detail: activityDetail,
      }),
      auditInsert(c.env, {
        actorUserId: user.id,
        actorIp: ip,
        actorUserAgent: ua,
        action: 'service_application_submitted',
        entityType: 'service_application',
        entityId: application.id,
        after: activityDetail,
      }),
      auditInsert(c.env, {
        actorUserId: user.id,
        actorIp: ip,
        actorUserAgent: ua,
        action: 'application_pdf_generated',
        entityType: 'client_document',
        entityId: pdfDocumentId,
        after: { application_id: application.id, r2_key: pdfKey, size_bytes: pdfBytes.byteLength },
      }),
      auditInsert(c.env, {
        actorUserId: user.id,
        actorIp: ip,
        actorUserAgent: ua,
        action: 'internal_document_attached',
        entityType: 'client_document',
        entityId: pdfDocumentId,
        after: { application_id: application.id, visibility: 'internal' },
      }),
    ])
  } catch (err) {
    await c.env.UPLOADS.delete(pdfKey).catch(() => {})
    throw err
  }

  const notifyResult = await notifyStaff(c.env, {
    staffUserIds: routing.staffUserIds,
    kind: 'service_application_submitted',
    fallbackMode: 'no_staff',
    subject: `New service interest: ${client.name} — ${service.name}`,
    html: `<p><strong>${escapeHtml(client.name)}</strong> submitted a new service application for <strong>${escapeHtml(service.name)}</strong>.</p><p>Application ID: ${escapeHtml(application.id)}</p>${mayRequireAttorney ? '<p><strong>Review flag:</strong> May require attorney coordination.</p>' : ''}<p>Open the client profile in Pinnacle HQ to review the application and internal PDF.</p>`,
  })

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: ip,
    actorUserAgent: ua,
    action: 'representative_notified',
    entityType: 'service_application',
    entityId: application.id,
    after: {
      assigned_staff_user_ids: routing.staffUserIds,
      email_recipients: notifyResult.recipients,
      used_fallback: notifyResult.usedFallback,
      unassigned: routing.unassigned,
    },
  })

  return c.json({
    ok: true,
    application_id: application.id,
    status: 'submitted',
    message: 'Application received. Your Pinnacle team will review it and follow up.',
  })
})

// Client-facing application history. Internal documents are intentionally never
// included, but submitted answers remain visible to the client.
serviceApplicationRoutes.get('/service-applications', requireClient, async (c) => {
  const user = c.get('user')
  const apps = await c.env.DB.prepare(
    `SELECT sa.id, sa.service_key, sa.status, sa.current_step, sa.is_unassigned, sa.submission_source,
            sa.may_require_attorney_coordination, sa.submitted_at, sa.created_at, sa.updated_at,
            s.name AS service_name, s.description AS service_description
     FROM service_applications sa JOIN services s ON s.key = sa.service_key
     WHERE sa.client_user_id = ? ORDER BY sa.created_at DESC`,
  ).bind(user.id).all<any>()
  const appRows = apps.results ?? []
  if (appRows.length === 0) return c.json({ applications: [] })
  const ids = appRows.map((a) => a.id)
  const placeholders = ids.map(() => '?').join(',')
  const answerRes = await c.env.DB.prepare(
    `SELECT application_id, question_key, question_label, step_label, step_order, sort_order, value_json
     FROM service_application_answers WHERE application_id IN (${placeholders})
     ORDER BY step_order, sort_order`,
  ).bind(...ids).all<any>()
  const answerByApp = new Map<string, any[]>()
  for (const row of answerRes.results ?? []) {
    if (!answerByApp.has(row.application_id)) answerByApp.set(row.application_id, [])
    answerByApp.get(row.application_id)!.push({ ...row, value: answerFromStorage(row.value_json), value_json: undefined })
  }
  return c.json({ applications: appRows.map((a) => ({ ...a, answers: answerByApp.get(a.id) ?? [] })) })
})

serviceApplicationRoutes.get('/service-applications/:id', requireUser, async (c) => {
  const user = c.get('user')
  const app = await c.env.DB.prepare(
    `SELECT sa.*, s.name AS service_name, s.description AS service_description
     FROM service_applications sa JOIN services s ON s.key = sa.service_key WHERE sa.id = ?`,
  ).bind(c.req.param('id') ?? '').first<any>()
  if (!app) return c.json({ error: 'not found' }, 404)
  if (user.role === 'client') {
    if (app.client_user_id !== user.id) return c.json({ error: 'forbidden' }, 403)
  } else if (!(await canAccessClient(c.env, user, app.client_user_id))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const [answerRows, attachments] = await Promise.all([
    getAnswerRows(c.env, app.id),
    getAttachments(c.env, app.id, user.role !== 'client'),
  ])
  const safeApp = { ...app }
  if (user.role === 'client') delete safeApp.pdf_document_id
  return c.json({
    application: safeApp,
    answers: answerRows.map((row) => ({ ...row, value: answerFromStorage(row.value_json), value_json: undefined })),
    attachments: user.role === 'client' ? attachments.filter((a) => a.visibility !== 'internal') : attachments,
  })
})

// Staff/admin pipeline status change. This deliberately updates the application
// record, not client_services enrollment, because application review and ongoing
// service delivery are separate lifecycle concepts.
serviceApplicationRoutes.patch('/service-applications/:id/status', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const app = await c.env.DB.prepare('SELECT * FROM service_applications WHERE id = ?').bind(c.req.param('id') ?? '').first<ApplicationRow>()
  if (!app) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, app.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  if (!body.status || !APPLICATION_STATUSES.includes(body.status)) return c.json({ error: 'invalid status' }, 400)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE service_applications SET status = ?, updated_at = datetime('now') WHERE id = ?`).bind(body.status, app.id),
    activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: app.client_user_id,
      kind: 'service_status_changed',
      detail: { application_id: app.id, service_key: app.service_key, from: app.status, to: body.status },
    }),
  ])
  return c.json({ ok: true })
})

// Secure document listing overrides the older metadata-only endpoint when this
// router is mounted first. Clients never receive internal document metadata.
serviceApplicationRoutes.get('/documents', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role === 'client') {
    const res = await c.env.DB.prepare(
      `SELECT * FROM client_documents
       WHERE client_user_id = ? AND visibility != 'internal'
       ORDER BY created_at DESC LIMIT 200`,
    ).bind(user.id).all()
    return c.json({ documents: res.results ?? [] })
  }
  const { where, params } = await scopeFilter(c.env, user)
  const res = await c.env.DB.prepare(
    `SELECT * FROM client_documents WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
  ).bind(...params).all()
  return c.json({ documents: res.results ?? [] })
})

// Enforce visibility again at download time; hiding the internal PDF in the
// client list alone is not a security boundary.
serviceApplicationRoutes.get('/documents/:id/file', requireUser, async (c) => {
  const user = c.get('user')
  const doc = await c.env.DB.prepare(
    `SELECT id, client_user_id, file_name, r2_key, content_type, visibility FROM client_documents WHERE id = ?`,
  ).bind(c.req.param('id') ?? '').first<{ id: string; client_user_id: string; file_name: string | null; r2_key: string | null; content_type: string | null; visibility: string }>()
  if (!doc || !doc.r2_key || !c.env.UPLOADS) return c.json({ error: 'file not found' }, 404)
  if (user.role === 'client') {
    if (doc.client_user_id !== user.id || doc.visibility === 'internal') return c.json({ error: 'file not found' }, 404)
  } else if (!(await canAccessClient(c.env, user, doc.client_user_id))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const object = await c.env.UPLOADS.get(doc.r2_key)
  if (!object) return c.json({ error: 'file not found' }, 404)
  const filename = safeFileName(doc.file_name || 'document')
  return new Response(object.body, {
    headers: {
      'Content-Type': doc.content_type || object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
