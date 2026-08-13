import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { uuid, decryptSensitive } from '../crypto'
import { scopeFilter, canAccessClient, ScopeError } from '../scope'
import { visibleClientIds } from '../access'
import { createActivationToken, revokeUserSessions } from '../session'
import { activityInsert, logActivity } from '../activity'
import { hasCapability, requireCapability, type NamedPermission } from '../capabilities'
import { sendEmail, escapeHtml } from '../email'
import { getService, getQuestions, prefillForQuestions, persistAnswers } from './serviceApplications'
import { toDisplayCase } from '../../../shared/displayCase'
import { calendarFeedUrls, signCalendarFeedToken } from '../calendarFeed'

export const adminRoutes = new Hono<AppEnv>()

adminRoutes.onError((err, c) => {
  if (err instanceof ScopeError) return c.json({ error: err.message }, err.status as any)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

// The staff console's own nav decides what to show a signed-in staff member
// based on this — without it, a capability grant is invisible until someone
// knows the exact URL to type. Admins get every capability implicitly.
// Owner is included too so the frontend can gate the Permanent Deletions
// view without a separate round-trip.
adminRoutes.get('/my-capabilities', requireStaff, async (c) => {
  const user = c.get('user')
  if (user.role === 'admin') {
    const row = await c.env.DB.prepare('SELECT is_owner FROM team_members WHERE user_id = ?').bind(user.id).first<{ is_owner: number }>()
    return c.json({
      can_reveal_payment_info: true,
      can_manage_users: true,
      can_manage_settings: true,
      can_view_reports: true,
      can_view_audit_log: true,
      can_manage_communications: true,
      is_owner: !!row?.is_owner,
    })
  }
  const row = await c.env.DB.prepare(
    'SELECT can_reveal_payment_info, can_manage_users, can_manage_settings, can_view_reports, can_view_audit_log, can_manage_communications, is_owner FROM team_members WHERE user_id = ?',
  ).bind(user.id).first<{
    can_reveal_payment_info: number
    can_manage_users: number
    can_manage_settings: number
    can_view_reports: number
    can_view_audit_log: number
    can_manage_communications: number
    is_owner: number
  }>()
  return c.json({
    can_reveal_payment_info: !!row?.can_reveal_payment_info,
    can_manage_users: !!row?.can_manage_users,
    can_manage_settings: !!row?.can_manage_settings,
    can_view_reports: !!row?.can_view_reports,
    can_view_audit_log: !!row?.can_view_audit_log,
    can_manage_communications: !!row?.can_manage_communications,
    is_owner: false,
  })
})

adminRoutes.get('/calendar/feed', requireStaff, async (c) => {
  const user = c.get('user')
  const token = await signCalendarFeedToken(user.id, c.env.SESSION_SECRET)
  const origin = new URL(c.req.url).origin
  return c.json(calendarFeedUrls(origin, token))
})

// ---------------- staff + admin: cross-client views ----------------
adminRoutes.get('/dashboard', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'user_id')
  const clientCount = await c.env.DB.prepare(`SELECT COUNT(*) n FROM client_profiles WHERE ${where}`).bind(...params).first<{ n: number }>()

  const { where: w2, params: p2 } = await scopeFilter(c.env, user)
  const [openTickets, openMatters, pendingTasks, pendingCalls, openInvoices, appts, activity, overdueTasks, overdueInvoices, staleTickets, staleInquiries] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE ${w2} AND status = 'open'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE ${w2} AND status != 'closed'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM client_tasks WHERE ${w2} AND status != 'done'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM planned_calls WHERE ${w2} AND status = 'requested'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM invoices WHERE ${w2} AND status = 'open'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT a.*, u.full_name AS client_name, u.email AS client_email FROM appointments a JOIN users u ON u.id = a.client_user_id
       WHERE ${w2.replace(/client_user_id/g, 'a.client_user_id')} AND a.starts_at >= datetime('now') AND a.status != 'cancelled'
       ORDER BY a.starts_at ASC LIMIT 5`,
    ).bind(...p2).all(),
    c.env.DB.prepare(
      `SELECT ae.*, actor.full_name AS actor_name, cu.full_name AS client_name, cu.email AS client_email
       FROM activity_events ae
       LEFT JOIN users actor ON actor.id = ae.actor_user_id
       LEFT JOIN users cu ON cu.id = ae.client_user_id
       WHERE (${w2.replace(/client_user_id/g, 'ae.client_user_id')}) OR ae.client_user_id IS NULL
       ORDER BY ae.created_at DESC LIMIT 15`,
    ).bind(...p2).all(),
    // "Needs attention" — items a staffer would otherwise have to go hunting
    // for on separate pages: overdue tasks, overdue invoices, tickets that
    // have sat a full day with no first response, and leads still marked
    // 'new' two days after coming in.
    c.env.DB.prepare(
      `SELECT t.id, t.title, t.due_date, t.client_user_id, u.full_name AS client_name, u.email AS client_email
       FROM client_tasks t JOIN users u ON u.id = t.client_user_id
       WHERE ${w2.replace(/client_user_id/g, 't.client_user_id')} AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < date('now')
       ORDER BY t.due_date ASC LIMIT 5`,
    ).bind(...p2).all(),
    c.env.DB.prepare(
      `SELECT i.id, i.amount_cents, i.due_date, i.client_user_id, u.full_name AS client_name, u.email AS client_email
       FROM invoices i JOIN users u ON u.id = i.client_user_id
       WHERE ${w2.replace(/client_user_id/g, 'i.client_user_id')} AND i.status = 'open' AND i.archived_at IS NULL AND i.due_date IS NOT NULL AND i.due_date < date('now')
       ORDER BY i.due_date ASC LIMIT 5`,
    ).bind(...p2).all(),
    c.env.DB.prepare(
      `SELECT tk.id, tk.subject, tk.created_at, tk.client_user_id, u.full_name AS client_name, u.email AS client_email
       FROM support_tickets tk JOIN users u ON u.id = tk.client_user_id
       WHERE ${w2.replace(/client_user_id/g, 'tk.client_user_id')} AND tk.status = 'open' AND tk.archived_at IS NULL
             AND tk.first_response_at IS NULL AND tk.created_at < datetime('now', '-1 day')
       ORDER BY tk.created_at ASC LIMIT 5`,
    ).bind(...p2).all(),
    // Leads aren't assigned to specific staff, so this one isn't scoped —
    // same as the existing /admin/inquiries list.
    c.env.DB.prepare(
      `SELECT id, name, email, created_at FROM contact_inquiries
       WHERE status = 'new' AND archived_at IS NULL AND created_at < datetime('now', '-2 days')
       ORDER BY created_at ASC LIMIT 5`,
    ).all(),
  ])

  return c.json({
    stats: {
      clients: clientCount?.n ?? 0,
      open_tickets: openTickets?.n ?? 0,
      open_matters: openMatters?.n ?? 0,
      pending_tasks: pendingTasks?.n ?? 0,
      pending_calls: pendingCalls?.n ?? 0,
      open_invoices: openInvoices?.n ?? 0,
    },
    upcoming_appointments: appts.results ?? [],
    recent_activity: activity.results ?? [],
    needs_attention: {
      overdue_tasks: overdueTasks.results ?? [],
      overdue_invoices: overdueInvoices.results ?? [],
      stale_tickets: staleTickets.results ?? [],
      stale_inquiries: staleInquiries.results ?? [],
    },
  })
})

adminRoutes.get('/clients', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'u.id')
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.status, u.created_at,
            cp.business_name, cp.onboarding_completed
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'client' AND ${where}
     ORDER BY u.created_at DESC LIMIT 500`,
  ).bind(...params).all()
  return c.json({ clients: res.results ?? [] })
})

adminRoutes.get('/clients/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const ok = await canAccessClient(c.env, user, id)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  // Client profiles are intentionally sectional. HQ asks only for the active
  // subpage instead of pulling the entire relationship history on every open.
  const section = c.req.query('section')
  if (section && ['overview', 'activity', 'services', 'work', 'documents', 'billing', 'relationships', 'details'].includes(section)) {
    const [account, profile, assignedStaff] = await Promise.all([
      c.env.DB.prepare('SELECT id, email, full_name, first_name, last_name, phone, status, created_at, last_login_at FROM users WHERE id = ?').bind(id).first(),
      c.env.DB.prepare('SELECT * FROM client_profiles WHERE user_id = ?').bind(id).first(),
      c.env.DB.prepare('SELECT u.id, u.full_name, u.email FROM staff_assignments sa JOIN users u ON u.id = sa.staff_user_id WHERE sa.client_user_id = ?').bind(id).all(),
    ])
    if (!account) return c.json({ error: 'not found' }, 404)
    const base = { account, profile, assigned_staff: assignedStaff.results ?? [] }

    if (section === 'overview') {
      const [services, matters, tasks, invoices, tickets, appts, activity] = await Promise.all([
        c.env.DB.prepare('SELECT cs.*, s.name FROM client_services cs JOIN services s ON s.key = cs.service_key WHERE client_user_id = ? ORDER BY cs.created_at DESC LIMIT 12').bind(id).all(),
        c.env.DB.prepare("SELECT * FROM matters WHERE client_user_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 8").bind(id).all(),
        c.env.DB.prepare("SELECT * FROM client_tasks WHERE client_user_id = ? AND status != 'done' ORDER BY created_at DESC LIMIT 8").bind(id).all(),
        c.env.DB.prepare("SELECT * FROM invoices WHERE client_user_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 8").bind(id).all(),
        c.env.DB.prepare("SELECT * FROM support_tickets WHERE client_user_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 8").bind(id).all(),
        c.env.DB.prepare("SELECT * FROM appointments WHERE client_user_id = ? AND starts_at >= datetime('now') ORDER BY starts_at ASC LIMIT 5").bind(id).all(),
        c.env.DB.prepare('SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email FROM activity_events ae LEFT JOIN users actor ON actor.id = ae.actor_user_id WHERE ae.client_user_id = ? ORDER BY ae.created_at DESC LIMIT 8').bind(id).all(),
      ])
      return c.json({ ...base, services: services.results ?? [], matters: matters.results ?? [], tasks: tasks.results ?? [], invoices: invoices.results ?? [], tickets: tickets.results ?? [], appointments: appts.results ?? [], recent_activity: activity.results ?? [] })
    }
    if (section === 'activity') {
      const [notes, activity] = await Promise.all([
        c.env.DB.prepare('SELECT n.*, a.full_name AS author_name, a.email AS author_email FROM internal_notes n LEFT JOIN users a ON a.id = n.author_user_id WHERE n.client_user_id = ? AND n.matter_id IS NULL ORDER BY n.created_at DESC LIMIT 100').bind(id).all(),
        c.env.DB.prepare('SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email FROM activity_events ae LEFT JOIN users actor ON actor.id = ae.actor_user_id WHERE ae.client_user_id = ? ORDER BY ae.created_at DESC LIMIT 100').bind(id).all(),
      ])
      return c.json({ ...base, notes: notes.results ?? [], recent_activity: activity.results ?? [] })
    }
    if (section === 'services') {
      const [services, answers, catalog, applications] = await Promise.all([
        c.env.DB.prepare('SELECT cs.*, s.name FROM client_services cs JOIN services s ON s.key = cs.service_key WHERE client_user_id = ?').bind(id).all(),
        c.env.DB.prepare('SELECT r.service_key, r.question_key, r.value, q.label, q.step_label FROM client_onboarding_responses r LEFT JOIN onboarding_questions q ON q.service_key = r.service_key AND q.question_key = r.question_key WHERE r.client_user_id = ? ORDER BY r.service_key, q.step_order, q.sort_order').bind(id).all(),
        c.env.DB.prepare('SELECT key, name FROM services WHERE active = 1 ORDER BY name').all(),
        c.env.DB.prepare('SELECT sa.id, sa.service_key, sa.status, sa.submission_source, sa.signed_name, sa.submitted_at, sa.created_at, s.name AS service_name, creator.full_name AS created_by_name FROM service_applications sa JOIN services s ON s.key = sa.service_key LEFT JOIN users creator ON creator.id = sa.created_by_user_id WHERE sa.client_user_id = ? ORDER BY sa.created_at DESC').bind(id).all(),
      ])
      return c.json({ ...base, services: services.results ?? [], application_answers: answers.results ?? [], service_catalog: catalog.results ?? [], service_applications: applications.results ?? [] })
    }
    if (section === 'work') {
      const [matters, tasks, funding, properties, tax, tickets, calls, appts] = await Promise.all([
        c.env.DB.prepare('SELECT * FROM matters WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(), c.env.DB.prepare('SELECT * FROM client_tasks WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(),
        c.env.DB.prepare('SELECT * FROM funding_applications WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(), c.env.DB.prepare('SELECT * FROM properties WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(),
        c.env.DB.prepare('SELECT * FROM tax_filings WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(), c.env.DB.prepare('SELECT * FROM support_tickets WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(),
        c.env.DB.prepare('SELECT * FROM planned_calls WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100').bind(id).all(), c.env.DB.prepare('SELECT * FROM appointments WHERE client_user_id = ? ORDER BY starts_at DESC LIMIT 100').bind(id).all(),
      ])
      return c.json({ ...base, matters: matters.results ?? [], tasks: tasks.results ?? [], funding: funding.results ?? [], properties: properties.results ?? [], tax_filings: tax.results ?? [], tickets: tickets.results ?? [], calls: calls.results ?? [], appointments: appts.results ?? [] })
    }
    if (section === 'documents') { const rows = await c.env.DB.prepare('SELECT * FROM client_documents WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 200').bind(id).all(); return c.json({ ...base, documents: rows.results ?? [] }) }
    if (section === 'billing') {
      const [invoices, methods] = await Promise.all([c.env.DB.prepare('SELECT * FROM invoices WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 200').bind(id).all(), c.env.DB.prepare('SELECT id, service_key, method_type, account_holder_name, bank_name, account_type, account_last4, created_at FROM client_payment_methods WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all()])
      return c.json({ ...base, invoices: invoices.results ?? [], payment_methods: methods.results ?? [] })
    }
    const onboarding = await c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM onboarding_questions q JOIN client_services cs ON cs.service_key=q.service_key WHERE cs.client_user_id=? AND q.required=1) total, (SELECT COUNT(*) FROM client_onboarding_responses r WHERE r.client_user_id=? AND r.value IS NOT NULL AND r.value!='') answered`).bind(id, id).first<any>()
    return c.json({ ...base, onboarding_progress: { answered: onboarding?.answered ?? 0, total: onboarding?.total ?? 0 } })
  }

  const [profile, account, services, matters, tasks, docs, invoices, funding, properties, tax, tickets, calls, appts, answers, paymentMethods, notes, assignedStaff, recentActivity, catalog, applications] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM client_profiles WHERE user_id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT id, email, full_name, first_name, last_name, phone, status, created_at, last_login_at FROM users WHERE id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT cs.*, s.name FROM client_services cs JOIN services s ON s.key = cs.service_key WHERE client_user_id = ?').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM matters WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM client_tasks WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM client_documents WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM invoices WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM funding_applications WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM properties WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM tax_filings WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM support_tickets WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM planned_calls WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM appointments WHERE client_user_id = ? ORDER BY starts_at DESC').bind(id).all(),
    c.env.DB.prepare(
      `SELECT r.service_key, r.question_key, r.value, q.label, q.step_label
       FROM client_onboarding_responses r
       LEFT JOIN onboarding_questions q ON q.service_key = r.service_key AND q.question_key = r.question_key
       WHERE r.client_user_id = ? ORDER BY r.service_key, q.step_order, q.sort_order`,
    ).bind(id).all(),
    // Masked — encrypted columns are never selected here. See the /reveal route for full values.
    c.env.DB.prepare(
      `SELECT id, service_key, method_type, account_holder_name, bank_name, account_type, account_last4, created_at
       FROM client_payment_methods WHERE client_user_id = ? ORDER BY created_at DESC`,
    ).bind(id).all(),
    // General profile notes only (matter_id IS NULL) — matter-specific notes
    // load on demand via GET /admin/matters/:matterId/notes when a matter's
    // thread is expanded, so this bundle doesn't grow with every case note.
    c.env.DB.prepare(
      `SELECT n.*, a.full_name AS author_name, a.email AS author_email
       FROM internal_notes n LEFT JOIN users a ON a.id = n.author_user_id
       WHERE n.client_user_id = ? AND n.matter_id IS NULL ORDER BY n.created_at DESC`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT u.id, u.full_name, u.email FROM staff_assignments sa JOIN users u ON u.id = sa.staff_user_id WHERE sa.client_user_id = ?`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email
       FROM activity_events ae LEFT JOIN users actor ON actor.id = ae.actor_user_id
       WHERE ae.client_user_id = ? ORDER BY ae.created_at DESC LIMIT 10`,
    ).bind(id).all(),
    c.env.DB.prepare('SELECT key, name FROM services WHERE active = 1 ORDER BY name').all(),
    c.env.DB.prepare(
      `SELECT sa.id, sa.service_key, sa.status, sa.submission_source, sa.signed_name, sa.submitted_at, sa.created_at,
              s.name AS service_name, creator.full_name AS created_by_name
       FROM service_applications sa
       JOIN services s ON s.key = sa.service_key
       LEFT JOIN users creator ON creator.id = sa.created_by_user_id
       WHERE sa.client_user_id = ? ORDER BY sa.created_at DESC`,
    ).bind(id).all(),
  ])

  if (!account) return c.json({ error: 'not found' }, 404)

  // Onboarding progress — required questions across the client's selected
  // services vs. how many they've actually answered. Distinct from the
  // completed flag: a client can be mid-wizard (some answers saved, flag
  // still 0) or have answered nothing yet if they haven't picked services.
  const onboardingTotals = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(DISTINCT q.question_key || '::' || q.service_key)
        FROM onboarding_questions q JOIN client_services cs ON cs.service_key = q.service_key
        WHERE cs.client_user_id = ? AND q.required = 1) AS total,
       (SELECT COUNT(DISTINCT r.question_key || '::' || r.service_key)
        FROM client_onboarding_responses r
        JOIN onboarding_questions q ON q.service_key = r.service_key AND q.question_key = r.question_key
        WHERE r.client_user_id = ? AND q.required = 1 AND r.value IS NOT NULL AND r.value != '') AS answered`,
  ).bind(id, id).first<{ total: number; answered: number }>()

  return c.json({
    account,
    profile,
    services: services.results ?? [],
    matters: matters.results ?? [],
    tasks: tasks.results ?? [],
    documents: docs.results ?? [],
    invoices: invoices.results ?? [],
    funding: funding.results ?? [],
    properties: properties.results ?? [],
    tax_filings: tax.results ?? [],
    tickets: tickets.results ?? [],
    calls: calls.results ?? [],
    appointments: appts.results ?? [],
    application_answers: answers.results ?? [],
    payment_methods: paymentMethods.results ?? [],
    notes: notes.results ?? [],
    assigned_staff: assignedStaff.results ?? [],
    recent_activity: recentActivity.results ?? [],
    onboarding_progress: { answered: onboardingTotals?.answered ?? 0, total: onboardingTotals?.total ?? 0 },
    service_catalog: catalog.results ?? [],
    service_applications: applications.results ?? [],
  })
})

// Staff/vendor-initiated service assignment: opens a draft application on the
// client's behalf, prefilled from whatever's already on file (name, email,
// phone, business name, state), and notifies the client. The client still
// has to log in, review, and electronically sign it in
// POST /portal/service-applications/:id/submit before it counts as
// submitted — this only gets it started for them.
adminRoutes.post('/clients/:id/services', requireStaff, async (c) => {
  const user = c.get('user')
  const clientId = c.req.param('id')!
  const ok = await canAccessClient(c.env, user, clientId)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  const client = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.phone
     FROM users u WHERE u.id = ? AND u.role = 'client'`,
  ).bind(clientId).first<{ id: string; email: string; full_name: string | null; first_name: string | null; last_name: string | null; phone: string | null }>()
  if (!client) return c.json({ error: 'client not found' }, 404)

  const body = await c.req.json<{ service_key?: string }>().catch(() => ({} as { service_key?: string }))
  const serviceKey = body.service_key ?? ''
  const service = await getService(c.env, serviceKey)
  if (!service) return c.json({ error: 'unknown service' }, 404)

  const existing = await c.env.DB.prepare(
    `SELECT id, status FROM service_applications WHERE client_user_id = ? AND service_key = ?
     AND status != 'closed' ORDER BY created_at DESC LIMIT 1`,
  ).bind(clientId, serviceKey).first<{ id: string; status: string }>()
  if (existing) return c.json({ error: `this client already has a ${existing.status} application for this service` }, 409)

  const profile = await c.env.DB.prepare('SELECT * FROM client_profiles WHERE user_id = ?').bind(clientId).first<any>()
  const questions = await getQuestions(c.env, serviceKey)
  const applicationId = uuid()
  await c.env.DB.prepare(
    `INSERT INTO service_applications (id, client_user_id, service_key, status, current_step, submission_source, created_by_user_id)
     VALUES (?, ?, ?, 'draft', 0, 'staff_assigned', ?)`,
  ).bind(applicationId, clientId, serviceKey, user.id).run()
  const application = await c.env.DB.prepare('SELECT * FROM service_applications WHERE id = ?').bind(applicationId).first<any>()

  const clientAsSessionUser: SessionUser = { id: client.id, email: client.email, full_name: client.full_name, first_name: client.first_name, last_name: client.last_name, role: 'client' }
  const prefill = prefillForQuestions(clientAsSessionUser, { ...profile, phone: client.phone }, questions)
  if (Object.keys(prefill).length > 0) await persistAnswers(c.env, application, questions, prefill)

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: clientId,
    kind: 'service_assigned_by_staff',
    detail: { application_id: applicationId, service_key: serviceKey, service_name: service.name },
  })

  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: client.email,
      subject: `A new service is ready in your Pinnacle portal — ${service.name}`,
      html: `<p>Hi ${escapeHtml(client.first_name || 'there')},</p><p>${escapeHtml(user.full_name || 'Your Pinnacle representative')} started a <strong>${escapeHtml(service.name)}</strong> application for you. We've pre-filled what we already have on file — log in to review, finish any remaining details, and sign to submit it.</p>`,
    }),
  )

  return c.json({ ok: true, application_id: applicationId }, 201)
})

// Staff/admin editable client contact + business profile -- scoped like
// every other client-touching write (canAccessClient), not requireAdmin,
// since staff already edit matters/tasks/etc. for clients they're assigned
// to. Separate from PATCH /portal/profile (self.ts), which is the client's
// own requireClient-only endpoint for the same client_profiles columns.
adminRoutes.patch('/clients/:id/profile', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const ok = await canAccessClient(c.env, user, id)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const profileFields: Record<string, string | null> = {}
  for (const key of ['business_name', 'entity_type', 'ein', 'state'] as const) {
    if (typeof body[key] === 'string') profileFields[key] = key === 'ein' ? (body[key] as string).trim().slice(0, 200) || null : toDisplayCase(body[key]).slice(0, 200) || null
  }
  const userFields: Record<string, string | null> = {}
  for (const key of ['full_name', 'phone'] as const) {
    if (typeof body[key] === 'string') userFields[key] = key === 'full_name' ? toDisplayCase(body[key]).slice(0, 200) || null : (body[key] as string).trim().slice(0, 200) || null
  }
  const profileCols = Object.keys(profileFields)
  const userCols = Object.keys(userFields)
  if (profileCols.length === 0 && userCols.length === 0) return c.json({ error: 'no valid fields supplied' }, 400)

  const stmts: D1PreparedStatement[] = []
  if (profileCols.length > 0) {
    stmts.push(
      c.env.DB.prepare(`UPDATE client_profiles SET ${profileCols.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`)
        .bind(...profileCols.map((k) => profileFields[k]), id),
    )
  }
  if (userCols.length > 0) {
    stmts.push(
      c.env.DB.prepare(`UPDATE users SET ${userCols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .bind(...userCols.map((k) => userFields[k]), id),
    )
  }
  const current = await c.env.DB.prepare(
    `SELECT cp.primary_party_id,cp.business_party_id,cp.business_name,cp.entity_type,cp.ein,cp.state,
            u.full_name,u.email,u.phone,u.first_name,u.last_name
     FROM client_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.user_id=?`,
  ).bind(id).first<any>()
  let personPartyId = current?.primary_party_id || ''
  if (!personPartyId && current) {
    personPartyId = uuid()
    stmts.push(
      c.env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email,phone,created_by_user_id) VALUES (?,'person',?,?,?,?)").bind(personPartyId,userFields.full_name || current.full_name || current.email,current.email,userFields.phone ?? current.phone,user.id),
      c.env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId,current.first_name,current.last_name),
      c.env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(id,personPartyId),
      c.env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId,id),
    )
  } else if (personPartyId && current) {
    stmts.push(c.env.DB.prepare('UPDATE relationship_parties SET display_name=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(userFields.full_name || current.full_name || current.email,userFields.phone ?? current.phone,personPartyId))
  }
  const nextBusinessName = Object.prototype.hasOwnProperty.call(profileFields, 'business_name') ? profileFields.business_name : current?.business_name
  if (nextBusinessName && personPartyId) {
    const businessPartyId = current?.business_party_id || uuid()
    if (!current?.business_party_id) {
      stmts.push(
        c.env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,created_by_user_id) VALUES (?,'business',?,?)").bind(businessPartyId,nextBusinessName,user.id),
        c.env.DB.prepare('INSERT INTO relationship_businesses(party_id,legal_name,entity_type,ein,state,primary_contact_party_id) VALUES (?,?,?,?,?,?)').bind(businessPartyId,nextBusinessName,profileFields.entity_type ?? current?.entity_type,profileFields.ein ?? current?.ein,profileFields.state ?? current?.state,personPartyId),
        c.env.DB.prepare("INSERT INTO party_relationships(id,from_party_id,to_party_id,relationship_type,label,created_by_user_id) VALUES (?,?,?,'primary_contact','Primary Contact',?)").bind(uuid(),personPartyId,businessPartyId,user.id),
        c.env.DB.prepare('UPDATE client_profiles SET business_party_id=? WHERE user_id=?').bind(businessPartyId,id),
      )
    } else {
      stmts.push(
        c.env.DB.prepare('UPDATE relationship_parties SET display_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(nextBusinessName,businessPartyId),
        c.env.DB.prepare('UPDATE relationship_businesses SET legal_name=?,entity_type=?,ein=?,state=?,primary_contact_party_id=? WHERE party_id=?').bind(nextBusinessName,profileFields.entity_type ?? current?.entity_type,profileFields.ein ?? current?.ein,profileFields.state ?? current?.state,personPartyId,businessPartyId),
      )
    }
  }
  stmts.push(activityInsert(c.env, { actorUserId: user.id, clientUserId: id, kind: 'client_profile_updated', detail: { ...profileFields, ...userFields } }))
  await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

// ---------------- internal notes (staff-only, never exposed to clients) ----------------
// General profile note when matter_id is omitted; a case/project note tied
// to a specific matter when it's supplied. Two-way in the sense that any
// staff member with access to this client can add to the same thread — it's
// a running internal conversation, not a single owner's private scratchpad.
adminRoutes.post('/clients/:id/notes', requireStaff, async (c) => {
  const user = c.get('user')
  const clientId = c.req.param('id') ?? ''
  const ok = await canAccessClient(c.env, user, clientId)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<{ body?: string; matter_id?: string }>().catch(() => ({}) as { body?: string; matter_id?: string })
  const noteBody = (body.body || '').trim().slice(0, 4000)
  if (!noteBody) return c.json({ error: 'note body is required' }, 400)

  let matterId: string | null = null
  if (body.matter_id) {
    const matter = await c.env.DB.prepare('SELECT id FROM matters WHERE id = ? AND client_user_id = ?').bind(body.matter_id, clientId).first()
    if (!matter) return c.json({ error: 'matter not found for this client' }, 404)
    matterId = body.matter_id
  }

  const id = uuid()
  await c.env.DB.prepare(
    'INSERT INTO internal_notes (id, client_user_id, matter_id, author_user_id, body) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, clientId, matterId, user.id, noteBody).run()
  return c.json({ ok: true, id }, 201)
})

adminRoutes.get('/matters/:matterId/notes', requireStaff, async (c) => {
  const user = c.get('user')
  const matterId = c.req.param('matterId')
  const matter = await c.env.DB.prepare('SELECT client_user_id FROM matters WHERE id = ?').bind(matterId).first<{ client_user_id: string }>()
  if (!matter) return c.json({ error: 'not found' }, 404)
  const ok = await canAccessClient(c.env, user, matter.client_user_id)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  const res = await c.env.DB.prepare(
    `SELECT n.*, a.full_name AS author_name, a.email AS author_email
     FROM internal_notes n LEFT JOIN users a ON a.id = n.author_user_id
     WHERE n.matter_id = ? ORDER BY n.created_at DESC`,
  ).bind(matterId).all()
  return c.json({ notes: res.results ?? [] })
})

// Reveal a payment method's full (decrypted) routing/account numbers.
// Admin, or a staff member specifically granted can_reveal_payment_info
// (see /users/:id/staff-profile) — given the sensitivity, everyone else is
// blocked and every successful reveal is itself logged.
adminRoutes.post('/clients/:id/payment-methods/:pmId/reveal', requireStaff, async (c) => {
  const user = c.get('user')
  const clientId = c.req.param('id') ?? ''
  const pmId = c.req.param('pmId')

  if (!(await hasCapability(c.env, user, 'can_reveal_payment_info'))) return c.json({ error: 'forbidden' }, 403)
  if (user.role !== 'admin') {
    const ok = await canAccessClient(c.env, user, clientId)
    if (!ok) return c.json({ error: 'forbidden' }, 403)
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM client_payment_methods WHERE id = ? AND client_user_id = ?',
  ).bind(pmId, clientId).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)

  const [routing_number, account_number] = await Promise.all([
    decryptSensitive(row.routing_number_enc, c.env.PAYMENT_ENCRYPTION_KEY),
    decryptSensitive(row.account_number_enc, c.env.PAYMENT_ENCRYPTION_KEY),
  ])

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: clientId,
    kind: 'payment_info_revealed',
    detail: { account_holder_name: row.account_holder_name, account_last4: row.account_last4 },
  })

  return c.json({ routing_number, account_number })
})

// ---------------- staff + admin: contact inquiries ----------------
// Converted or archived leads are excluded by default — this is what makes
// a converted lead "automatically disappear from the sales pipeline"
// (both this list and the Pipelines board's Inquiries tab read from here).
// Reserved client logins are not conversion; converted_at is the marker.
// See GET /admin/conversions for converted leads and GET
// /admin/records/inquiries/archived for archived ones.
adminRoutes.get('/inquiries', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT ci.*, s.name AS service_name FROM contact_inquiries ci
     LEFT JOIN services s ON s.key = ci.service_key
     WHERE ci.converted_at IS NULL AND ci.archived_at IS NULL
     ORDER BY ci.created_at DESC LIMIT 200`,
  ).all()
  return c.json({ inquiries: res.results ?? [] })
})

const INQUIRY_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost']

// Staff-entered lead — same shape as a public /contact submission, but for a
// prospect staff met offline (a call, a referral, a networking event) who
// never filled out the website form themselves. Flows through the same
// pipeline/status lifecycle and "Convert to client" action as any other
// inquiry — this just adds a second way to get one into the system.
adminRoutes.post('/inquiries', requireStaff, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ name?: string; email?: string; phone?: string; service_key?: string; message?: string }>()
    .catch(() => ({}) as { name?: string; email?: string; phone?: string; service_key?: string; message?: string })
  const name = (body.name || '').trim().slice(0, 200)
  const email = (body.email || '').trim().toLowerCase().slice(0, 200)
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) || null : null
  const message = (body.message || '').trim().slice(0, 4000)
  if (!name) return c.json({ error: 'name is required' }, 400)
  if (!email || !email.includes('@')) return c.json({ error: 'a valid email is required' }, 400)

  let serviceKey: string | null = null
  if (body.service_key) {
    const svc = await c.env.DB.prepare('SELECT key FROM services WHERE key = ? AND active = 1').bind(body.service_key).first()
    if (svc) serviceKey = body.service_key
  }

  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO contact_inquiries (id, name, email, phone, service_key, message, status) VALUES (?, ?, ?, ?, ?, ?, 'new')`,
    ).bind(id, name, email, phone, serviceKey, message),
    activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: null,
      kind: 'inquiry_submitted',
      detail: { name, email, service_key: serviceKey, staff_entered: true },
    }),
  ])
  return c.json({ ok: true, id }, 201)
})

adminRoutes.patch('/inquiries/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = INQUIRY_STATUSES.includes(body.status ?? '') ? body.status : undefined
  if (status) {
    const row = await c.env.DB.prepare('SELECT * FROM contact_inquiries WHERE id = ?').bind(id).first<any>()
    if (!row) return c.json({ error: 'not found' }, 404)
    await c.env.DB.prepare('UPDATE contact_inquiries SET status = ? WHERE id = ?').bind(status, id).run()
    if (status !== row.status) {
      await logActivity(c.env, {
        actorUserId: user.id,
        clientUserId: null,
        kind: 'inquiry_status_changed',
        detail: { name: row.name, email: row.email, from: row.status, to: status },
      })
    }
  }
  return c.json({ ok: true })
})

function slugStaffRole(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
  return key || null
}

// ---------------- users: admin, or staff granted can_manage_users ----------------
// Role changes and capability grants stay strictly admin-only below (a
// delegated "can manage users" staffer could otherwise promote themselves
// to admin) — this capability only opens up viewing the list and
// onboarding new accounts at their requested role.
adminRoutes.get('/users', requireStaff, async (c) => {
  const user = c.get('user')
  if (!(await hasCapability(c.env, user, 'can_manage_users'))) return c.json({ error: 'forbidden' }, 403)
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.full_name, u.first_name, u.last_name, u.status, u.created_at, u.last_login_at,
            tm.staff_role, tm.title, tm.can_reveal_payment_info, tm.can_manage_users, tm.can_manage_settings,
            tm.can_view_reports, tm.can_view_audit_log, tm.can_manage_communications, tm.is_owner,
            tm.party_type, tm.vendor_category, tm.role_definition_id, rd.name role_name, rd.role_key role_code
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN role_definitions rd ON rd.id = tm.role_definition_id
     ORDER BY u.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ users: res.results ?? [] })
})

// Staff role + capability grants — separate from the coarse staff/admin
// split on `users.role`. A capability lets an admin hand a specific staff
// member access to something normally admin-only (e.g. viewing decrypted
// banking info) without promoting them to full admin. Admin-only: granting
// capabilities is itself a privilege-escalation-sensitive action.
adminRoutes.patch('/users/:id/staff-profile', requireAdmin, async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id') || ''
  const target = await c.env.DB.prepare(
    `SELECT u.role, u.full_name, u.email, tm.id team_member_id
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(id).first<{ role: string; full_name: string | null; email: string; team_member_id: string | null }>()
  if (!target) return c.json({ error: 'not found' }, 404)
  if (target.role === 'client') return c.json({ error: 'only staff/admin accounts have a staff profile' }, 400)

  const body = await c.req.json<{
    staff_role?: string
    title?: string
    can_reveal_payment_info?: boolean
    can_manage_users?: boolean
    can_manage_settings?: boolean
    can_view_reports?: boolean
    can_view_audit_log?: boolean
    can_manage_communications?: boolean
    is_owner?: boolean
    party_type?: string
    vendor_category?: string
    status?: string
    account_role?: string
    role_definition_id?: string | null
    permission_overrides?: Record<string, boolean | null>
  }>().catch(() => ({}) as any)

  let staffRole = slugStaffRole(body.staff_role)
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) || null : null
  const partyType = body.party_type === 'vendor' ? 'vendor' : 'employee'
  const vendorCategory = partyType === 'vendor' && typeof body.vendor_category === 'string'
    ? body.vendor_category.trim().slice(0, 100) || null
    : null
  const nextStatus = body.status === 'active' || body.status === 'suspended' ? body.status : null
  const nextAccountRole = ['staff', 'admin'].includes(body.account_role ?? '') ? body.account_role : null
  const isOwner = body.is_owner && (nextAccountRole === 'admin' || (!nextAccountRole && target.role === 'admin')) ? 1 : 0

  let roleDefinitionId: string | null | undefined
  if (body.role_definition_id !== undefined) {
    const requested = typeof body.role_definition_id === 'string' ? body.role_definition_id.trim() : ''
    if (!requested) {
      roleDefinitionId = null
    } else {
      const role = await c.env.DB.prepare(
        'SELECT id, role_key, party_type, is_archived FROM role_definitions WHERE id = ?',
      ).bind(requested).first<{ id: string; role_key: string; party_type: string; is_archived: number }>()
      if (!role) return c.json({ error: 'role template not found' }, 404)
      if (role.is_archived) return c.json({ error: 'that role is archived' }, 400)
      if (role.party_type !== 'either' && role.party_type !== partyType) {
        return c.json({ error: `this role is for ${role.party_type} accounts` }, 400)
      }
      roleDefinitionId = role.id
      if (!staffRole) staffRole = role.role_key
    }
  }
  if (!staffRole) staffRole = 'representative'

  const overrides = body.permission_overrides && typeof body.permission_overrides === 'object'
    ? body.permission_overrides
    : null
  const flag = (legacy: boolean | undefined, named: NamedPermission) => {
    if (overrides && named in overrides) return overrides[named] === true ? 1 : 0
    return legacy ? 1 : 0
  }

  const teamMemberId = target.team_member_id || uuid()
  const profileSql = roleDefinitionId === undefined
    ? `INSERT INTO team_members (id, user_id, staff_role, title, can_reveal_payment_info, can_manage_users, can_manage_settings, can_view_reports, can_view_audit_log, can_manage_communications, is_owner, party_type, vendor_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         staff_role = excluded.staff_role, title = excluded.title,
         can_reveal_payment_info = excluded.can_reveal_payment_info,
         can_manage_users = excluded.can_manage_users,
         can_manage_settings = excluded.can_manage_settings,
         can_view_reports = excluded.can_view_reports,
         can_view_audit_log = excluded.can_view_audit_log,
         can_manage_communications = excluded.can_manage_communications,
         is_owner = excluded.is_owner,
         party_type = excluded.party_type,
         vendor_category = excluded.vendor_category`
    : `INSERT INTO team_members (id, user_id, staff_role, title, can_reveal_payment_info, can_manage_users, can_manage_settings, can_view_reports, can_view_audit_log, can_manage_communications, is_owner, party_type, vendor_category, role_definition_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         staff_role = excluded.staff_role, title = excluded.title,
         can_reveal_payment_info = excluded.can_reveal_payment_info,
         can_manage_users = excluded.can_manage_users,
         can_manage_settings = excluded.can_manage_settings,
         can_view_reports = excluded.can_view_reports,
         can_view_audit_log = excluded.can_view_audit_log,
         can_manage_communications = excluded.can_manage_communications,
         is_owner = excluded.is_owner,
         party_type = excluded.party_type,
         vendor_category = excluded.vendor_category,
         role_definition_id = excluded.role_definition_id`
  const profileBinds = [
    teamMemberId, id, staffRole, title,
    flag(body.can_reveal_payment_info, 'reveal_payment_info'),
    flag(body.can_manage_users, 'manage_users'),
    flag(body.can_manage_settings, 'manage_settings'),
    flag(body.can_view_reports, 'view_reports'),
    flag(body.can_view_audit_log, 'view_audit_log'),
    flag(body.can_manage_communications, 'manage_communications'),
    isOwner, partyType, vendorCategory,
  ]
  if (roleDefinitionId !== undefined) profileBinds.push(roleDefinitionId)

  const statements = [c.env.DB.prepare(profileSql).bind(...profileBinds)]
  if (nextStatus) statements.push(c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(nextStatus, id))
  if (nextAccountRole && nextAccountRole !== target.role) {
    statements.push(c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(nextAccountRole, id))
  }

  if (overrides) {
    const catalog = await c.env.DB.prepare('SELECT permission_key FROM permission_catalog').all<{ permission_key: string }>()
    const allowedKeys = new Set((catalog.results || []).map((row) => row.permission_key))
    statements.push(c.env.DB.prepare('DELETE FROM team_member_permission_overrides WHERE team_member_id = ?').bind(teamMemberId))
    for (const [key, value] of Object.entries(overrides)) {
      if (!allowedKeys.has(key) || value === null || value === undefined) continue
      statements.push(c.env.DB.prepare(
        `INSERT INTO team_member_permission_overrides(team_member_id, permission_key, granted, updated_at)
         VALUES(?,?,?,datetime('now'))`,
      ).bind(teamMemberId, key, value ? 1 : 0))
    }
  }

  await c.env.DB.batch(statements)
  if (nextAccountRole && nextAccountRole !== target.role) await revokeUserSessions(c.env, id)

  await logActivity(c.env, {
    actorUserId: actor.id,
    clientUserId: null,
    kind: 'staff_profile_updated',
    detail: {
      name: target.full_name || target.email,
      staff_role: staffRole,
      party_type: partyType,
      status: nextStatus ?? undefined,
      account_role: nextAccountRole ?? undefined,
      role_definition_id: roleDefinitionId ?? undefined,
    },
  })
  return c.json({ ok: true })
})

// A staff/vendor account's own saved signature, appended to Communications
// Center drafts on demand. Self-service — no capability needed to edit
// your own signature.
adminRoutes.patch('/my-signature', requireStaff, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ signature_html?: string }>().catch(() => ({}) as any)
  const html = typeof body.signature_html === 'string' ? body.signature_html.slice(0, 5000) : ''
  await c.env.DB.prepare(
    `INSERT INTO team_members (id, user_id, staff_role, signature_html) VALUES (?, ?, 'representative', ?)
     ON CONFLICT(user_id) DO UPDATE SET signature_html = excluded.signature_html`,
  ).bind(uuid(), user.id, html || null).run()
  return c.json({ ok: true })
})

adminRoutes.get('/my-signature', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare('SELECT signature_html FROM team_members WHERE user_id = ?').bind(user.id).first<{ signature_html: string | null }>()
  return c.json({ signature_html: row?.signature_html ?? '' })
})

// Creates a user account AND, for clients, a real client_profile with
// business details — not just a bare login shell. No password is
// accepted here either: like bootstrap, this returns a one-time
// activation link (via setup_token) for the new account holder to set
// their own password, consistent with the "never invent/hardcode a
// password" rule applied to the admin account.
adminRoutes.post('/users', requireStaff, async (c) => {
  const user = c.get('user')
  if (!(await hasCapability(c.env, user, 'can_manage_users'))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{
    email: string
    role?: string
    full_name?: string
    first_name?: string
    last_name?: string
    phone?: string
    business_name?: string
    entity_type?: string
    ein?: string
    state?: string
    services_enrolled?: string[]
  }>().catch(() => ({ email: '' }) as any)
  const e = (body.email || '').trim().toLowerCase()
  const r = ['client', 'staff', 'admin'].includes(body.role ?? '') ? (body.role as string) : 'client'
  // A delegated (non-admin) can_manage_users grant can onboard staff/clients
  // but not mint new admins — that stays a real-admin-only action.
  if (r === 'admin' && user.role !== 'admin') return c.json({ error: 'only an admin can create an admin account' }, 403)
  if (!e) return c.json({ error: 'email required' }, 400)

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'a user with that email already exists' }, 409)

  const id = uuid()
  const firstName = toDisplayCase(body.first_name) || null
  const lastName = toDisplayCase(body.last_name) || null
  const fn = toDisplayCase(body.full_name || [firstName, lastName].filter(Boolean).join(' ')) || null
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) || null : null

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, 'active')`,
    ).bind(id, e, r, fn, firstName, lastName, phone),
  ]
  if (r === 'client') {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, business_name, entity_type, ein, state, services_enrolled, onboarding_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(
        uuid(),
        id,
        toDisplayCase(body.business_name) || null,
        toDisplayCase(body.entity_type) || null,
        body.ein ?? null,
        toDisplayCase(body.state) || null,
        Array.isArray(body.services_enrolled) ? JSON.stringify(body.services_enrolled) : null,
      ),
    )
  } else if (r === 'staff') {
    stmts.push(c.env.DB.prepare("INSERT INTO team_members (id, user_id, staff_role) VALUES (?, ?, 'pinnacle_admin')").bind(uuid(), id))
  }
  stmts.push(
    activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: r === 'client' ? id : null,
      kind: 'user_created',
      detail: { email: e, role: r, full_name: fn },
    }),
  )
  await c.env.DB.batch(stmts)

  const setupToken = await createActivationToken(c.env, id)
  return c.json({ ok: true, user: { id, email: e, role: r, full_name: fn }, setup_token: setupToken }, 201)
})

adminRoutes.patch('/users/:id', requireAdmin, async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')!
  const body = await c.req.json<{ status?: string; role?: string }>().catch(() => ({} as { status?: string; role?: string }))
  const status = ['active', 'suspended'].includes(body.status ?? '') ? body.status : undefined
  const role = ['client', 'staff', 'admin'].includes(body.role ?? '') ? body.role : undefined
  if (!status && !role) return c.json({ error: 'nothing to update' }, 400)
  const target = await c.env.DB.prepare('SELECT role, status, full_name, email FROM users WHERE id = ?').bind(id).first<any>()
  await c.env.DB.prepare(
    'UPDATE users SET status = COALESCE(?, status), role = COALESCE(?, role) WHERE id = ?',
  ).bind(status ?? null, role ?? null, id).run()
  if (target && ((status && status !== target.status) || (role && role !== target.role))) {
    // A status/role change is a privilege change — kill any session issued
    // under the old status/role instead of leaving it valid for up to 12h.
    await revokeUserSessions(c.env, id)
    await logActivity(c.env, {
      actorUserId: actor.id,
      clientUserId: target.role === 'client' ? id : null,
      kind: 'user_status_changed',
      detail: { name: target.full_name || target.email, from: { status: target.status, role: target.role }, to: { status: status ?? target.status, role: role ?? target.role } },
    })
  }
  return c.json({ ok: true })
})

// ---------------- staff assignments: admin, or staff granted can_manage_users ----------------
// Controlling which staff can see which clients is a user-management action
// in the same spirit as onboarding accounts, so it shares that capability
// rather than needing its own — kept consistent with the "Assignments" nav
// item, which is shown under the same condition (see AdminApp.tsx).
adminRoutes.get('/assignments', requireStaff, requireCapability('can_manage_users'), async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT sa.*, su.email AS staff_email, su.full_name AS staff_name, cu.email AS client_email, cu.full_name AS client_name
     FROM staff_assignments sa
     JOIN users su ON su.id = sa.staff_user_id
     JOIN users cu ON cu.id = sa.client_user_id
     ORDER BY sa.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ assignments: res.results ?? [] })
})

// Creating/deleting an assignment grants real data access to a client, not just
// visibility into the list — same class of power as a capability grant itself,
// so (like those grants) it stays admin-only. A can_manage_users staffer could
// otherwise assign themselves to any client and bypass scoping entirely.
adminRoutes.post('/assignments', requireAdmin, async (c) => {
  const { staff_user_id, client_user_id } = await c.req.json<{ staff_user_id: string; client_user_id: string }>()
    .catch(() => ({ staff_user_id: '', client_user_id: '' }))
  if (!staff_user_id || !client_user_id) return c.json({ error: 'staff_user_id and client_user_id are required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO staff_assignments (id, staff_user_id, client_user_id) VALUES (?, ?, ?)
     ON CONFLICT(staff_user_id, client_user_id) DO NOTHING`,
  ).bind(id, staff_user_id, client_user_id).run()
  return c.json({ ok: true, id }, 201)
})

// Same access-granting concern as the single-assignment route above —
// admin-only. Ignores duplicates the same way (ON CONFLICT DO NOTHING) so
// re-running a bulk assign over an overlapping client set is a no-op for
// pairs that already exist rather than an error.
adminRoutes.post('/assignments/bulk', requireAdmin, async (c) => {
  const user = c.get('user')
  const { staff_user_id, client_user_ids } = await c.req
    .json<{ staff_user_id: string; client_user_ids: string[] }>()
    .catch(() => ({ staff_user_id: '', client_user_ids: [] as string[] }))
  if (!staff_user_id || !Array.isArray(client_user_ids) || client_user_ids.length === 0) {
    return c.json({ error: 'staff_user_id and at least one client_user_id are required' }, 400)
  }
  const ids = [...new Set(client_user_ids)].slice(0, 500)
  const stmts = ids.map((clientId) =>
    c.env.DB.prepare(
      `INSERT INTO staff_assignments (id, staff_user_id, client_user_id) VALUES (?, ?, ?)
       ON CONFLICT(staff_user_id, client_user_id) DO NOTHING`,
    ).bind(uuid(), staff_user_id, clientId),
  )
  stmts.push(activityInsert(c.env, { actorUserId: user.id, kind: 'bulk_assignment_created', detail: { staff_user_id, client_count: ids.length } }))
  await c.env.DB.batch(stmts)
  return c.json({ ok: true, count: ids.length }, 201)
})

adminRoutes.delete('/assignments/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM staff_assignments WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---------------- admin-only: service catalog ----------------
// Drives what a client can apply for in the portal (services + their
// multi-step application question sets). Separate from the public
// marketing site's src/data/services.ts, which is static copy compiled
// into the frontend bundle — editing here does not change public page
// content, only what's available to apply for once logged in.
adminRoutes.get('/services', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM onboarding_questions q WHERE q.service_key = s.key) AS question_count
     FROM services s ORDER BY s.sort_order, s.name`,
  ).all()
  return c.json({ services: res.results ?? [] })
})

adminRoutes.post('/services', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const body = await c.req.json<{ key: string; name: string; description?: string; category?: string; sort_order?: number }>()
    .catch(() => ({ key: '', name: '' }) as any)
  const key = (body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const name = (body.name || '').trim()
  if (!key || !name) return c.json({ error: 'key and name are required' }, 400)
  const exists = await c.env.DB.prepare('SELECT 1 FROM services WHERE key = ?').bind(key).first()
  if (exists) return c.json({ error: 'a service with that key already exists' }, 409)
  await c.env.DB.prepare(
    'INSERT INTO services (key, name, description, category, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
  ).bind(key, name, body.description ?? null, body.category ?? null, body.sort_order ?? 0).run()
  return c.json({ ok: true, key }, 201)
})

adminRoutes.patch('/services/:key', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const key = c.req.param('key')
  const body = await c.req.json<{ name?: string; description?: string; category?: string; sort_order?: number; active?: boolean }>()
    .catch(() => ({}) as any)
  await c.env.DB.prepare(
    `UPDATE services SET name = COALESCE(?, name), description = COALESCE(?, description),
     category = COALESCE(?, category), sort_order = COALESCE(?, sort_order),
     active = COALESCE(?, active) WHERE key = ?`,
  ).bind(
    body.name ?? null,
    body.description ?? null,
    body.category ?? null,
    typeof body.sort_order === 'number' ? body.sort_order : null,
    typeof body.active === 'boolean' ? (body.active ? 1 : 0) : null,
    key,
  ).run()
  return c.json({ ok: true })
})

adminRoutes.get('/services/:key/questions', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const res = await c.env.DB.prepare(
    'SELECT * FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order',
  ).bind(c.req.param('key')).all()
  return c.json({ questions: res.results ?? [] })
})

adminRoutes.post('/services/:key/questions', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const serviceKey = c.req.param('key')
  const body = await c.req.json<{
    question_key: string
    label: string
    help_text?: string
    input_type?: string
    options?: string
    required?: boolean
    step_label?: string
    step_order?: number
    sort_order?: number
  }>().catch(() => ({}) as any)
  const questionKey = (body.question_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const label = (body.label || '').trim()
  if (!questionKey || !label) return c.json({ error: 'question_key and label are required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO onboarding_questions
       (id, service_key, question_key, label, help_text, input_type, options, required, step_label, step_order, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    serviceKey,
    questionKey,
    label,
    body.help_text ?? null,
    body.input_type ?? 'text',
    body.options ?? null,
    body.required === false ? 0 : 1,
    body.step_label ?? null,
    body.step_order ?? 1,
    body.sort_order ?? 0,
  ).run()
  return c.json({ ok: true, id }, 201)
})

adminRoutes.patch('/services/questions/:id', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    label?: string
    help_text?: string
    input_type?: string
    options?: string
    required?: boolean
    step_label?: string
    step_order?: number
    sort_order?: number
  }>().catch(() => ({}) as any)
  await c.env.DB.prepare(
    `UPDATE onboarding_questions SET
       label = COALESCE(?, label), help_text = COALESCE(?, help_text), input_type = COALESCE(?, input_type),
       options = COALESCE(?, options), required = COALESCE(?, required),
       step_label = COALESCE(?, step_label), step_order = COALESCE(?, step_order), sort_order = COALESCE(?, sort_order)
     WHERE id = ?`,
  ).bind(
    body.label ?? null,
    body.help_text ?? null,
    body.input_type ?? null,
    body.options ?? null,
    typeof body.required === 'boolean' ? (body.required ? 1 : 0) : null,
    body.step_label ?? null,
    typeof body.step_order === 'number' ? body.step_order : null,
    typeof body.sort_order === 'number' ? body.sort_order : null,
    id,
  ).run()
  return c.json({ ok: true })
})

adminRoutes.delete('/services/questions/:id', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  await c.env.DB.prepare('DELETE FROM onboarding_questions WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---------------- admin-only: settings ----------------
const HIDDEN_APP_SETTINGS = new Set(['resend_webhook_signing_secret', 'resend_webhook_id'])

adminRoutes.get('/settings', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM app_settings').all<{ key: string; value: string }>()
  const settings = (res.results ?? []).filter((row) => !HIDDEN_APP_SETTINGS.has(row.key))
  return c.json({ settings })
})

adminRoutes.patch('/settings', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const body = await c.req.json<Record<string, string>>().catch(() => ({} as Record<string, string>))
  const entries = Object.entries(body).slice(0, 50)
  for (const [key, value] of entries) {
    if (HIDDEN_APP_SETTINGS.has(key)) continue
    await c.env.DB.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).bind(key, String(value)).run()
  }
  return c.json({ ok: true })
})

// ---------------- staff + admin: activity feed / notifications ----------------
// Events with client_user_id = NULL (new inquiry, new staff/admin user) are firm-wide
// and shown to every staff member regardless of client assignment.
const ACTIVITY_SEEN_KEY = (userId: string) => `activity_seen:${userId}`

async function mutedKinds(env: Env, userId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT muted_kinds FROM notification_prefs WHERE user_id = ?').bind(userId).first<{ muted_kinds: string }>()
  if (!row) return []
  try {
    return JSON.parse(row.muted_kinds)
  } catch {
    return []
  }
}

adminRoutes.get('/activity', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'ae.client_user_id')
  const [res, muted] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email,
              cu.full_name AS client_name, cu.email AS client_email
       FROM activity_events ae
       LEFT JOIN users actor ON actor.id = ae.actor_user_id
       LEFT JOIN users cu ON cu.id = ae.client_user_id
       WHERE (${where}) OR ae.client_user_id IS NULL
       ORDER BY ae.created_at DESC LIMIT 100`,
    ).bind(...params).all<{ kind: string }>(),
    mutedKinds(c.env, user.id),
  ])
  const events = muted.length > 0 ? (res.results ?? []).filter((e) => !muted.includes(e.kind)) : res.results ?? []
  return c.json({ events })
})

adminRoutes.get('/activity/unread-count', requireStaff, async (c) => {
  const user = c.get('user')
  const seen = (await c.env.SESSIONS.get(ACTIVITY_SEEN_KEY(user.id))) || '1970-01-01T00:00:00.000Z'
  const { where, params } = await scopeFilter(c.env, user, 'ae.client_user_id')
  const muted = await mutedKinds(c.env, user.id)
  const mutedClause = muted.length > 0 ? `AND ae.kind NOT IN (${muted.map(() => '?').join(',')})` : ''
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM activity_events ae WHERE ((${where}) OR ae.client_user_id IS NULL) AND ae.created_at > ? ${mutedClause}`,
  ).bind(...params, seen, ...muted).first<{ n: number }>()
  return c.json({ count: row?.n ?? 0 })
})

adminRoutes.post('/activity/mark-seen', requireStaff, async (c) => {
  const user = c.get('user')
  await c.env.SESSIONS.put(ACTIVITY_SEEN_KEY(user.id), new Date().toISOString())
  return c.json({ ok: true })
})

// ---------------- staff + admin: notification preferences (own account) ----------------
const NOTIFICATION_KINDS = [
  'inquiry_submitted',
  'inquiry_status_changed',
  'client_signed_up',
  'matter_created',
  'matter_status_changed',
  'task_created',
  'task_status_changed',
  'ticket_created',
  'ticket_status_changed',
  'call_created',
  'call_status_changed',
  'invoice_created',
  'invoice_status_changed',
  'funding_created',
  'funding_status_changed',
  'service_application_submitted',
  'service_status_changed',
  'payment_info_revealed',
  'message_received',
  'message_sent',
  'vendor_signup_submitted',
]

adminRoutes.get('/notification-prefs', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare('SELECT muted_kinds, email_enabled, sound_enabled FROM notification_prefs WHERE user_id = ?').bind(user.id).first<{ muted_kinds: string; email_enabled: number; sound_enabled: number }>()
  return c.json({
    kinds: NOTIFICATION_KINDS,
    muted_kinds: row ? JSON.parse(row.muted_kinds) : [],
    email_enabled: row ? !!row.email_enabled : false,
    sound_enabled: row ? !!row.sound_enabled : true,
  })
})

adminRoutes.patch('/notification-prefs', requireStaff, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ muted_kinds?: string[]; email_enabled?: boolean; sound_enabled?: boolean }>()
    .catch(() => ({}) as { muted_kinds?: string[]; email_enabled?: boolean; sound_enabled?: boolean })
  const muted = Array.isArray(body.muted_kinds) ? body.muted_kinds.filter((k: string) => NOTIFICATION_KINDS.includes(k)) : []
  await c.env.DB.prepare(
    `INSERT INTO notification_prefs (user_id, muted_kinds, email_enabled, sound_enabled, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET muted_kinds = excluded.muted_kinds, email_enabled = excluded.email_enabled, sound_enabled = excluded.sound_enabled, updated_at = excluded.updated_at`,
  ).bind(user.id, JSON.stringify(muted), body.email_enabled ? 1 : 0, body.sound_enabled === false ? 0 : 1).run()
  return c.json({ ok: true })
})

// ---------------- staff + admin: open-items drill-down (from dashboard stat cards) ----------------
const OPEN_ITEM_CONFIG: Record<string, { table: string; statusPredicate: string }> = {
  tickets: { table: 'support_tickets', statusPredicate: "t.status = 'open'" },
  matters: { table: 'matters', statusPredicate: "t.status != 'closed'" },
  tasks: { table: 'client_tasks', statusPredicate: "t.status != 'done'" },
  calls: { table: 'planned_calls', statusPredicate: "t.status = 'requested'" },
  invoices: { table: 'invoices', statusPredicate: "t.status = 'open'" },
}

// ---------------- staff + admin: pipelines (kanban-style stage boards) ----------------
// Cross-client, all-statuses views for the Pipelines page. Status *changes*
// go through the existing per-module PATCH endpoints (/portal/matters/:id,
// /portal/funding/:id, /portal/services/:id, /admin/inquiries/:id) — this is
// read-only, just reshaped for a board instead of a single client's detail page.
const PIPELINE_CONFIG: Record<string, { table: string; statuses: string[]; select?: string; join?: string }> = {
  matters: { table: 'matters', statuses: ['open', 'in_progress', 'blocked', 'closed'] },
  tasks: { table: 'client_tasks', statuses: ['pending', 'in_progress', 'done'] },
  funding: { table: 'funding_applications', statuses: ['draft', 'submitted', 'under_review', 'approved', 'declined'] },
  service_applications: {
    table: 'client_services',
    statuses: ['requested', 'submitted', 'active', 'completed', 'declined'],
    select: 's.name AS service_name',
    join: 'JOIN services s ON s.key = t.service_key',
  },
}

adminRoutes.get('/pipeline/:type', requireStaff, async (c) => {
  const user = c.get('user')
  const type = c.req.param('type') ?? ''
  const cfg = PIPELINE_CONFIG[type]
  if (!cfg) return c.json({ error: 'unknown pipeline type — expected one of ' + Object.keys(PIPELINE_CONFIG).join(', ') }, 400)
  const { where, params } = await scopeFilter(c.env, user, 't.client_user_id')
  const res = await c.env.DB.prepare(
    `SELECT t.*, u.full_name AS client_name, u.email AS client_email${cfg.select ? ', ' + cfg.select : ''}
     FROM ${cfg.table} t
     JOIN users u ON u.id = t.client_user_id
     ${cfg.join ?? ''}
     WHERE ${where}
     ORDER BY t.created_at DESC LIMIT 300`,
  ).bind(...params).all()
  return c.json({ type, statuses: cfg.statuses, items: res.results ?? [] })
})

adminRoutes.get('/open-items', requireStaff, async (c) => {
  const user = c.get('user')
  const type = c.req.query('type') ?? ''
  const cfg = OPEN_ITEM_CONFIG[type]
  if (!cfg) return c.json({ error: 'unknown type — expected one of ' + Object.keys(OPEN_ITEM_CONFIG).join(', ') }, 400)
  const { where, params } = await scopeFilter(c.env, user, 't.client_user_id')
  const res = await c.env.DB.prepare(
    `SELECT t.*, u.full_name AS client_name, u.email AS client_email
     FROM ${cfg.table} t JOIN users u ON u.id = t.client_user_id
     WHERE ${where} AND ${cfg.statusPredicate}
     ORDER BY t.created_at DESC LIMIT 200`,
  ).bind(...params).all()
  return c.json({ type, items: res.results ?? [] })
})

// unused import guard (visibleClientIds retained for potential future use in reports)
void visibleClientIds
