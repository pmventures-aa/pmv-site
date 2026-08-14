import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { serviceOfferings as defaultOfferings } from '../../../src/data/serviceOfferings'

export const serviceOfferingPublicRoutes = new Hono<AppEnv>()
export const serviceOfferingAdminRoutes = new Hono<AppEnv>()

type OfferingBody = {
  id?: string
  service_key?: string
  name?: string
  description?: string
  starting_price?: number | null
  pricing_label?: string | null
  badge?: string | null
  requirements?: string[]
  client_note?: string | null
  active?: boolean
  sort_order?: number
  provider_payout_min?: number | null
  provider_payout_max?: number | null
  provider_payout_notes?: string | null
  required_documents?: string[]
  intake_prompts?: string[]
}

const cleanId = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 100)
const cleanText = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cents = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null
const arrayJson = (value: unknown): string | null => Array.isArray(value) ? JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean).slice(0, 50)) : null

// Bump when the default catalog in src/data/serviceOfferings.ts changes so
// already-seeded databases pick up new offerings and refreshed market pricing.
// Rows edited in HQ (updated_at moved past created_at) are never overwritten;
// rows deactivated in HQ stay deactivated.
const SEED_VERSION = '2026-08-market-pricing'

export async function ensureServiceOfferingsSeeded(env: Env) {
  const [countRow, versionRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM service_offerings').first<{ n: number }>(),
    env.DB.prepare("SELECT value FROM app_settings WHERE key = 'service_offerings_seed_version'").first<{ value: string | null }>(),
  ])
  if ((countRow?.n ?? 0) > 0 && versionRow?.value === SEED_VERSION) return

  const statements: D1PreparedStatement[] = []
  defaultOfferings.forEach((item, index) => {
    const priceCents = typeof item.startingPrice === 'number' ? Math.round(item.startingPrice * 100) : null
    const requirements = item.requirements?.length ? JSON.stringify(item.requirements) : null
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO service_offerings
        (id, service_key, name, description, starting_price_cents, pricing_label, badge, requirements_json, client_note, active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(item.id, item.serviceKey, item.name, item.description, priceCents, item.pricingLabel ?? null, item.badge ?? null, requirements, item.note ?? null, index * 10))
    statements.push(env.DB.prepare(`
      UPDATE service_offerings SET name = ?, description = ?, starting_price_cents = ?, pricing_label = ?, badge = ?, requirements_json = ?, client_note = ?, sort_order = ?
      WHERE id = ? AND updated_at = created_at
    `).bind(item.name, item.description, priceCents, item.pricingLabel ?? null, item.badge ?? null, requirements, item.note ?? null, index * 10, item.id))
  })
  statements.push(env.DB.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('service_offerings_seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).bind(SEED_VERSION))
  for (let i = 0; i < statements.length; i += 40) await env.DB.batch(statements.slice(i, i + 40))
}

function parseJsonList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [] } catch { return [] }
}

function publicShape(row: any) {
  return {
    id: row.id,
    serviceKey: row.service_key,
    name: row.name,
    description: row.description,
    startingPrice: typeof row.starting_price_cents === 'number' ? row.starting_price_cents / 100 : undefined,
    pricingLabel: row.pricing_label || undefined,
    badge: row.badge || undefined,
    requirements: parseJsonList(row.requirements_json),
    note: row.client_note || undefined,
    requiredDocuments: parseJsonList(row.required_documents_json),
    intakePrompts: parseJsonList(row.intake_prompts_json),
    sortOrder: row.sort_order,
  }
}

const PUBLIC_OFFERINGS_CACHE_KEY = 'public-service-offerings:v1'
const PUBLIC_OFFERINGS_TTL = 300

async function loadCachedPublicOfferings(env: Env): Promise<ReturnType<typeof publicShape>[] | null> {
  try {
    const cached = await env.SESSIONS.get(PUBLIC_OFFERINGS_CACHE_KEY, 'json') as ReturnType<typeof publicShape>[] | null
    if (Array.isArray(cached) && cached.length) return cached
  } catch {
    // KV misses must not block the catalog.
  }
  return null
}

async function storeCachedPublicOfferings(env: Env, offerings: ReturnType<typeof publicShape>[]): Promise<void> {
  try {
    await env.SESSIONS.put(PUBLIC_OFFERINGS_CACHE_KEY, JSON.stringify(offerings), { expirationTtl: PUBLIC_OFFERINGS_TTL })
  } catch {
    // Best-effort cache.
  }
}

async function bustPublicOfferingsCache(env: Env): Promise<void> {
  try { await env.SESSIONS.delete(PUBLIC_OFFERINGS_CACHE_KEY) } catch { /* ignore */ }
}

serviceOfferingPublicRoutes.get('/service-offerings', async (c) => {
  await ensureServiceOfferingsSeeded(c.env)
  const serviceKey = (c.req.query('service_key') || '').trim()
  let offerings = await loadCachedPublicOfferings(c.env)
  if (!offerings) {
    const res = await c.env.DB.prepare(
      'SELECT * FROM service_offerings WHERE active = 1 ORDER BY service_key, sort_order, name',
    ).all<any>()
    offerings = (res.results ?? []).map(publicShape)
    await storeCachedPublicOfferings(c.env, offerings)
  }
  const filtered = serviceKey ? offerings.filter((item) => item.serviceKey === serviceKey) : offerings
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ offerings: filtered })
})

serviceOfferingAdminRoutes.get('/service-offerings', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  await ensureServiceOfferingsSeeded(c.env)
  const serviceKey = (c.req.query('service_key') || '').trim()
  const where = serviceKey ? 'WHERE service_key = ?' : ''
  const query = `SELECT * FROM service_offerings ${where} ORDER BY service_key, sort_order, name`
  const res = serviceKey ? await c.env.DB.prepare(query).bind(serviceKey).all<any>() : await c.env.DB.prepare(query).all<any>()
  return c.json({ offerings: (res.results ?? []).map((row: any) => ({
    ...publicShape(row),
    active: !!row.active,
    providerPayoutMin: typeof row.provider_payout_min_cents === 'number' ? row.provider_payout_min_cents / 100 : null,
    providerPayoutMax: typeof row.provider_payout_max_cents === 'number' ? row.provider_payout_max_cents / 100 : null,
    providerPayoutNotes: row.provider_payout_notes || '',
  })) })
})

serviceOfferingAdminRoutes.post('/service-offerings', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  await ensureServiceOfferingsSeeded(c.env)
  const body = await c.req.json<OfferingBody>().catch(() => ({} as OfferingBody))
  const id = cleanId(body.id || '')
  const serviceKey = cleanText(body.service_key, 100)
  const name = cleanText(body.name, 200)
  const description = cleanText(body.description, 2000)
  if (!id || !serviceKey || !name || !description) return c.json({ error: 'id, service_key, name, and description are required' }, 400)
  if (!(await c.env.DB.prepare('SELECT 1 FROM services WHERE key = ?').bind(serviceKey).first())) return c.json({ error: 'unknown parent service' }, 400)
  if (await c.env.DB.prepare('SELECT 1 FROM service_offerings WHERE id = ?').bind(id).first()) return c.json({ error: 'an offering with that id already exists' }, 409)
  await c.env.DB.prepare(`INSERT INTO service_offerings
    (id,service_key,name,description,starting_price_cents,pricing_label,badge,requirements_json,client_note,active,sort_order,provider_payout_min_cents,provider_payout_max_cents,provider_payout_notes,required_documents_json,intake_prompts_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, serviceKey, name, description, cents(body.starting_price), cleanText(body.pricing_label, 120) || null,
      cleanText(body.badge, 80) || null, arrayJson(body.requirements), cleanText(body.client_note, 1000) || null,
      body.active === false ? 0 : 1, Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      cents(body.provider_payout_min), cents(body.provider_payout_max), cleanText(body.provider_payout_notes, 1000) || null,
      arrayJson(body.required_documents), arrayJson(body.intake_prompts),
    ).run()
  await bustPublicOfferingsCache(c.env)
  return c.json({ ok: true, id }, 201)
})

serviceOfferingAdminRoutes.patch('/service-offerings/:id', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  await ensureServiceOfferingsSeeded(c.env)
  const body = await c.req.json<OfferingBody>().catch(() => ({} as OfferingBody))
  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value) }
  if (typeof body.name === 'string') add('name', cleanText(body.name, 200))
  if (typeof body.description === 'string') add('description', cleanText(body.description, 2000))
  if ('starting_price' in body) add('starting_price_cents', cents(body.starting_price))
  if ('pricing_label' in body) add('pricing_label', cleanText(body.pricing_label, 120) || null)
  if ('badge' in body) add('badge', cleanText(body.badge, 80) || null)
  if ('requirements' in body) add('requirements_json', arrayJson(body.requirements))
  if ('client_note' in body) add('client_note', cleanText(body.client_note, 1000) || null)
  if (typeof body.active === 'boolean') add('active', body.active ? 1 : 0)
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) add('sort_order', body.sort_order)
  if ('provider_payout_min' in body) add('provider_payout_min_cents', cents(body.provider_payout_min))
  if ('provider_payout_max' in body) add('provider_payout_max_cents', cents(body.provider_payout_max))
  if ('provider_payout_notes' in body) add('provider_payout_notes', cleanText(body.provider_payout_notes, 1000) || null)
  if ('required_documents' in body) add('required_documents_json', arrayJson(body.required_documents))
  if ('intake_prompts' in body) add('intake_prompts_json', arrayJson(body.intake_prompts))
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400)
  sets.push(`updated_at = datetime('now')`)
  const result = await c.env.DB.prepare(`UPDATE service_offerings SET ${sets.join(', ')} WHERE id = ?`).bind(...values, c.req.param('id') || '').run()
  if (!result.meta.changes) return c.json({ error: 'offering not found' }, 404)
  await bustPublicOfferingsCache(c.env)
  return c.json({ ok: true })
})

serviceOfferingAdminRoutes.delete('/service-offerings/:id', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM service_offerings WHERE id = ?').bind(c.req.param('id') || '').run()
  if (!result.meta.changes) return c.json({ error: 'offering not found' }, 404)
  await bustPublicOfferingsCache(c.env)
  return c.json({ ok: true })
})
