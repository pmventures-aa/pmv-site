import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { logActivity } from '../activity'
import { escapeHtml, notifyStaff } from '../email'
import { twoBusinessHoursFrom } from '../scopeFunnel'
import { CARE_PLANS, findTier, findService, type PlanFamilyKey } from '../../../shared/carePlans'

export const carePlanPublicRoutes = new Hono<AppEnv>()

const MAX_PER_HOUR = 8
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

async function throttled(c: any) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const key = `careplan:${ip}`
  const count = Number(await c.env.SESSIONS.get(key) || 0)
  if (count >= MAX_PER_HOUR) return true
  await c.env.SESSIONS.put(key, String(count + 1), { expirationTtl: 3600 })
  return false
}

carePlanPublicRoutes.post('/care-plan-leads', async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  if (clean(body.website, 200)) return c.json({ ok: true }, 201)
  if (await throttled(c)) return c.json({ error: 'too many requests - call (561) 388-7879 if the need is urgent' }, 429)

  const family = clean(body.plan_family, 20) as PlanFamilyKey
  if (family !== 'property' && family !== 'ops' && family !== 'legal') return c.json({ error: 'invalid plan family' }, 400)
  const familyDef = CARE_PLANS[family]

  const tierKey = clean(body.plan_tier, 40)
  const tier = findTier(family, tierKey)
  if (!tier) return c.json({ error: 'invalid plan tier' }, 400)

  const contactName = clean(body.contact_name, 120)
  const email = clean(body.email, 200).toLowerCase()
  if (!contactName) return c.json({ error: 'contact name required' }, 400)
  if (!email || !emailOk(email)) return c.json({ error: 'valid email required' }, 400)
  const phone = clean(body.phone, 30) || null
  const businessName = clean(body.business_name, 200) || null
  const additionalNotes = clean(body.additional_notes, 2000) || null
  const source = clean(body.source, 60) || 'care-plans'
  const audience = clean(body.audience, 60) || null

  // Validate every service the visitor selected against the plan family menu
  // so we only store known service keys. Unknown keys are silently dropped
  // rather than 400'd - the intake UI is the source of truth for what is
  // selectable.
  const rawServices = Array.isArray(body.services) ? body.services : []
  const services = rawServices
    .map((k: unknown) => clean(k, 60))
    .filter((k: string) => !!findService(family, k))
    .slice(0, 30)

  // Intake fields depend on the plan family. Keep as-is inside a bounded
  // JSON blob so HQ sees exactly what the prospect chose without a schema
  // change for each new question.
  const intake: Record<string, unknown> = {}
  const rawIntake = (body.intake && typeof body.intake === 'object') ? body.intake : {}
  for (const [k, v] of Object.entries(rawIntake)) {
    if (typeof v === 'string') intake[k] = v.trim().slice(0, 500)
    else if (typeof v === 'number' && Number.isFinite(v)) intake[k] = v
    else if (typeof v === 'boolean') intake[k] = v
    else if (Array.isArray(v)) intake[k] = v.map((x) => typeof x === 'string' ? x.trim().slice(0, 200) : null).filter(Boolean).slice(0, 20)
  }

  const id = uuid()
  const publicToken = uuid().replace(/-/g, '')
  const now = new Date()
  const responseDueAt = twoBusinessHoursFrom(now)

  await c.env.DB.prepare(`INSERT INTO care_plan_leads
    (id, public_token, plan_family, plan_tier, contact_name, email, phone, business_name, services_json, intake_json, additional_notes, source, audience, response_due_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, publicToken, family, tier.key, contactName, email, phone, businessName, JSON.stringify(services), JSON.stringify(intake), additionalNotes, source, audience, responseDueAt)
    .run()

  try {
    await logActivity(c.env, {
      kind: 'care_plan_lead.created',
      detail: {
        care_plan_lead_id: id,
        plan_family: family,
        plan_tier: tier.key,
        contact_name: contactName,
        email,
        services,
      },
    })
  } catch {}

  const summaryLines = [
    `Plan: ${familyDef.eyebrow} - ${tier.name}`,
    `Contact: ${contactName} <${email}>${phone ? ` / ${phone}` : ''}`,
    businessName ? `Business: ${businessName}` : null,
    services.length ? `Services of interest (${services.length}): ${services.map((k: string) => findService(family, k)?.label || k).join(', ')}` : null,
    Object.keys(intake).length ? `Intake: ${Object.entries(intake).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`).join(' · ')}` : null,
    additionalNotes ? `Notes: ${additionalNotes}` : null,
  ].filter(Boolean)

  try {
    await notifyStaff(c.env, {
      staffUserIds: [],
      kind: 'care_plan_lead.created',
      subject: `Care Plan lead: ${tier.name} (${familyDef.eyebrow})`,
      html: `<h2>New care plan lead</h2><p>${escapeHtml(summaryLines.join(' · '))}</p><p>Reply due by ${escapeHtml(responseDueAt)} UTC.</p>`,
    })
  } catch {}

  return c.json({
    ok: true,
    lead_token: publicToken,
    confirmation_url: `/care-plans/confirmation?token=${publicToken}`,
    response_due_at: responseDueAt,
  }, 201)
})

carePlanPublicRoutes.get('/care-plan-leads/:token', async (c) => {
  const token = c.req.param('token').slice(0, 64)
  const row = await c.env.DB.prepare(`SELECT plan_family, plan_tier, contact_name, email, phone, business_name, response_due_at
    FROM care_plan_leads WHERE public_token = ?`).bind(token).first() as any
  if (!row) return c.json({ error: 'not found' }, 404)
  const family = row.plan_family as PlanFamilyKey
  const tier = findTier(family, row.plan_tier)
  return c.json({
    lead: {
      plan_family: family,
      plan_family_label: CARE_PLANS[family].eyebrow,
      plan_tier: row.plan_tier,
      plan_tier_label: tier?.name || row.plan_tier,
      contact_name: row.contact_name,
      email: row.email,
      phone: row.phone,
      business_name: row.business_name,
      response_due_at: row.response_due_at,
    },
  })
})
