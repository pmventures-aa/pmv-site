import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin, requireStaff } from '../mid'
import { hasCapability } from '../capabilities'
import { uuid } from '../crypto'
import { createActivationToken } from '../session'
import { activityInsert } from '../activity'
import { sendAccountWelcome, sendPortalReminder, sendVendorApproved } from '../accountEmails'
import { setupPasswordUrl } from '../appUrls'
import { toDisplayCase } from '../../../shared/displayCase'

export const accountEmailsAdminRoutes = new Hono<AppEnv>()

const norm = (value: string) => (value || '').trim().toLowerCase()
const clean = (value: unknown, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : ''

function firstName(row: { first_name?: string | null; full_name?: string | null }): string | null {
  if (row.first_name?.trim()) return row.first_name.trim()
  const full = row.full_name?.trim()
  return full ? full.split(/\s+/)[0] : null
}

function setupUrl(role: string, token: string): string {
  return setupPasswordUrl(role, token)
}

async function canManageUsers(c: any): Promise<boolean> {
  const user = c.get('user')
  return hasCapability(c.env, user, 'can_manage_users')
}

function emailFailure(err: unknown) {
  return {
    deliveryId: '',
    status: 'failed' as const,
    providerId: null,
    error: err instanceof Error ? err.message : 'Email delivery could not be completed.',
  }
}

// Enhanced user list for the Users screen. Password hashes never leave the
// backend; password_set is the only credential state exposed to HQ.
accountEmailsAdminRoutes.get('/account-users', requireStaff, async (c) => {
  if (!(await canManageUsers(c))) return c.json({ error: 'forbidden' }, 403)
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.full_name, u.first_name, u.last_name, u.status, u.created_at, u.last_login_at,
            CASE WHEN u.password_hash IS NULL THEN 0 ELSE 1 END AS password_set,
            u.welcome_email_sent_at, u.welcome_email_provider_id, u.welcome_email_status, u.welcome_email_last_event_at,
            tm.staff_role, tm.title, tm.party_type, tm.vendor_category
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
     ORDER BY u.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ users: res.results ?? [] })
})

// New account provisioning path used by HQ. It preserves the existing
// no-generated-password model but automatically sends the one-time setup link.
// The account write commits before email delivery; a provider/tracking outage
// is reported separately and never turns a successfully created user into an
// apparent creation failure that an admin might accidentally retry.
accountEmailsAdminRoutes.post('/account-users', requireStaff, async (c) => {
  const actor = c.get('user')
  if (!(await canManageUsers(c))) return c.json({ error: 'forbidden' }, 403)
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

  const email = norm(body.email)
  const role = ['client', 'staff', 'admin'].includes(body.role ?? '') ? (body.role as 'client' | 'staff' | 'admin') : 'client'
  if (role === 'admin' && actor.role !== 'admin') return c.json({ error: 'only an admin can create an admin account' }, 403)
  if (!email || !email.includes('@')) return c.json({ error: 'a valid email is required' }, 400)

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  if (exists) return c.json({ error: 'a user with that email already exists' }, 409)

  const first = toDisplayCase(clean(body.first_name, 120)) || null
  const last = toDisplayCase(clean(body.last_name, 120)) || null
  const fullName = toDisplayCase(clean(body.full_name, 240) || [first, last].filter(Boolean).join(' ')) || null
  const phone = clean(body.phone, 40) || null
  const id = uuid()

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, 'active')`,
    ).bind(id, email, role, fullName, first, last, phone),
  ]
  if (role === 'client') {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, business_name, entity_type, ein, state, services_enrolled, onboarding_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(
        uuid(),
        id,
        toDisplayCase(clean(body.business_name)) || null,
        toDisplayCase(clean(body.entity_type, 100)) || null,
        clean(body.ein, 100) || null,
        toDisplayCase(clean(body.state, 100)) || null,
        Array.isArray(body.services_enrolled) ? JSON.stringify(body.services_enrolled) : null,
      ),
    )
  } else if (role === 'staff') {
    statements.push(c.env.DB.prepare("INSERT INTO team_members (id, user_id, staff_role) VALUES (?, ?, 'pinnacle_admin')").bind(uuid(), id))
  }
  statements.push(
    activityInsert(c.env, {
      actorUserId: actor.id,
      clientUserId: role === 'client' ? id : null,
      kind: 'user_created',
      detail: { email, role, full_name: fullName },
    }),
  )
  await c.env.DB.batch(statements)

  const token = await createActivationToken(c.env, id)
  const actionUrl = setupUrl(role, token)
  let emailDelivery
  try {
    emailDelivery = await sendAccountWelcome(c.env, {
      userId: id,
      role,
      email,
      firstName: first || fullName,
      businessName: role === 'client' ? clean(body.business_name) || null : null,
      creationType: 'admin_invite',
      actionLabel: role === 'client' ? 'Set Up My Pinnacle Account' : 'Set Up My HQ Account',
      actionUrl,
      actorUserId: actor.id,
    })
  } catch (err) {
    console.error('[account-email] HQ account invitation failed after account creation', err)
    emailDelivery = emailFailure(err)
  }

  return c.json({
    ok: true,
    user: { id, email, role, full_name: fullName },
    setup_token: token,
    email_delivery: emailDelivery,
  }, 201)
})

// Resend a setup invitation if the account has no password. If setup is
// already complete, send a normal portal reminder instead of issuing an
// unnecessary password-activation token.
accountEmailsAdminRoutes.post('/users/:id/setup-email', requireStaff, async (c) => {
  const actor = c.get('user')
  if (!(await canManageUsers(c))) return c.json({ error: 'forbidden' }, 403)
  const id = c.req.param('id')!
  const user = await c.env.DB.prepare(
    `SELECT id, email, role, full_name, first_name, status, password_hash FROM users WHERE id = ?`,
  ).bind(id).first<any>()
  if (!user) return c.json({ error: 'user not found' }, 404)
  if (user.status !== 'active') return c.json({ error: 'activate this account before sending access email' }, 409)

  if (!user.password_hash) {
    const token = await createActivationToken(c.env, id)
    const actionUrl = setupUrl(user.role, token)
    let result
    try {
      result = await sendAccountWelcome(c.env, {
        userId: id,
        role: user.role,
        email: user.email,
        firstName: firstName(user),
        creationType: 'admin_invite',
        actionLabel: user.role === 'client' ? 'Set Up My Pinnacle Account' : 'Set Up My HQ Account',
        actionUrl,
        actorUserId: actor.id,
        idempotencyKey: `setup-resend/${id}/${uuid()}`,
      })
    } catch (err) {
      console.error('[account-email] setup resend failed', err)
      result = emailFailure(err)
    }
    return c.json({ ok: true, mode: 'setup', setup_token: token, email_delivery: result })
  }

  let result
  try {
    result = await sendPortalReminder(c.env, {
      userId: id,
      role: user.role,
      email: user.email,
      firstName: firstName(user),
      actorUserId: actor.id,
      idempotencyKey: `portal-reminder/${id}/${uuid()}`,
    })
  } catch (err) {
    console.error('[account-email] portal reminder failed', err)
    result = emailFailure(err)
  }
  return c.json({ ok: true, mode: 'reminder', email_delivery: result })
})

accountEmailsAdminRoutes.get('/users/:id/account-emails', requireStaff, async (c) => {
  if (!(await canManageUsers(c))) return c.json({ error: 'forbidden' }, 403)
  const id = c.req.param('id')!
  const res = await c.env.DB.prepare(
    `SELECT id, email, kind, creation_type, subject, status, provider_id, last_event_type, last_error,
            created_at, sent_at, delivered_at, failed_at, updated_at
     FROM account_email_deliveries WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`,
  ).bind(id).all()
  return c.json({ deliveries: res.results ?? [] })
})

// Called after the existing vendor approval/profile update succeeds. The route
// verifies the resulting state before sending, so it cannot announce approval
// for a still-pending or non-vendor account.
accountEmailsAdminRoutes.post('/users/:id/vendor-approval-email', requireAdmin, async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')!
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.status, tm.party_type
     FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(id).first<any>()
  if (!row) return c.json({ error: 'user not found' }, 404)
  if (row.party_type !== 'vendor') return c.json({ error: 'this account is not a vendor' }, 400)
  if (row.status !== 'active') return c.json({ error: 'approve this vendor before sending the approval email' }, 409)

  let result
  try {
    result = await sendVendorApproved(c.env, {
      userId: id,
      email: row.email,
      firstName: firstName(row),
      actorUserId: actor.id,
    })
  } catch (err) {
    console.error('[account-email] vendor approval email failed after approval', err)
    result = emailFailure(err)
  }
  return c.json({ ok: true, email_delivery: result })
})
