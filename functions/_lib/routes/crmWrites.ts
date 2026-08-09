import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { activityInsert } from '../activity'

export const crmWriteRoutes = new Hono<AppEnv>()
crmWriteRoutes.use('*', requireStaff)

const clean = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) || null : null

crmWriteRoutes.post('/crm/records', async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as any))
  const recordType = body.record_type === 'business' ? 'business' : 'person'
  const firstName = clean(body.first_name, 100)
  const lastName = clean(body.last_name, 100)
  const companyName = clean(body.company_name, 200)
  const name = recordType === 'business'
    ? companyName
    : clean(body.name, 200) || [firstName, lastName].filter(Boolean).join(' ') || companyName
  const email = clean(body.email, 250)?.toLowerCase() ?? null
  if (!name) return c.json({ error: recordType === 'business' ? 'business name is required' : 'name is required' }, 400)
  // contact_inquiries.email is still NOT NULL in the current production schema.
  // Keep that invariant here; a future migration can relax it if PMV wants records
  // with no email at all. Never create a fake/synthetic email address.
  if (!email || !email.includes('@')) return c.json({ error: 'a valid email is required' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contact_inquiries WHERE lower(email) = lower(?) AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1',
  ).bind(email).first<{ id: string }>()
  if (existing) return c.json({ error: 'a CRM record with that email already exists', existing_id: existing.id }, 409)

  let serviceKey: string | null = null
  if (typeof body.service_key === 'string' && body.service_key) {
    const service = await c.env.DB.prepare('SELECT key FROM services WHERE key = ? AND active = 1').bind(body.service_key).first<{ key: string }>()
    if (service) serviceKey = service.key
  }

  let ownerId: string | null = null
  if (typeof body.owner_staff_user_id === 'string' && body.owner_staff_user_id) {
    const owner = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'")
      .bind(body.owner_staff_user_id).first<{ id: string }>()
    if (owner) ownerId = owner.id
  }

  const lifecycle = ['lead', 'prospect', 'opportunity', 'lost'].includes(String(body.lifecycle_stage)) ? String(body.lifecycle_stage) : 'lead'
  const status = ['new', 'contacted', 'qualified', 'lost'].includes(String(body.status)) ? String(body.status) : 'new'
  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO contact_inquiries
       (id, name, email, phone, service_key, message, status, record_type, first_name, last_name, company_name, job_title,
        website, industry, source, lifecycle_stage, owner_staff_user_id, address_line1, address_line2, city, state, postal_code, country, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      id,
      name,
      email,
      clean(body.phone, 60),
      serviceKey,
      clean(body.message ?? body.notes, 4000) ?? '',
      status,
      recordType,
      firstName,
      lastName,
      companyName,
      clean(body.job_title, 160),
      clean(body.website, 500),
      clean(body.industry, 160),
      clean(body.source, 160) ?? 'Manual entry',
      lifecycle,
      ownerId,
      clean(body.address_line1, 250),
      clean(body.address_line2, 250),
      clean(body.city, 120),
      clean(body.state, 120),
      clean(body.postal_code, 30),
      clean(body.country, 120),
    ),
    activityInsert(c.env, { actorUserId: actor.id, inquiryId: id, kind: 'inquiry_submitted', detail: { name, email, source: clean(body.source, 160) ?? 'Manual entry', staff_entered: true } }),
  ])
  return c.json({ ok: true, id }, 201)
})
