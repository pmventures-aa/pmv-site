// Cleaning & Turnover pricing API.
//
//   cleaningPricingPublicRoutes -> mounted at '/'      (customer calculator)
//   cleaningPricingAdminRoutes  -> mounted at '/admin' (HQ config + internal quote)
//
// Security model:
//   * The public config and quote endpoints return ONLY customer-safe fields.
//     Vendor payout, margin, and the minimum-margin/minimum-job flags are
//     stripped by toCustomerQuote() and never leave the server unauthenticated.
//   * Reading the full config (with commercial/payout settings) requires staff.
//   * Writing the config requires an owner; every save snapshots the prior
//     document into cleaning_pricing_config_versions for auditability.
//
// The launch defaults live in shared/cleaningPricing.ts and are seeded into the
// table on first read, so the config is defined in exactly one place.

import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireOwner } from '../mid'
import { uuid } from '../crypto'
import { actorGeo, actorIp, actorUserAgent, logAudit } from '../auditLog'
import {
  DEFAULT_CLEANING_CONFIG,
  parseCleaningConfig,
  priceCleaning,
  toCustomerQuote,
  startingPrices,
  type CleaningPricingConfig,
  type CleaningQuoteInput,
  type CleaningServiceType,
  type CleaningCounty,
  type CleaningFrequency,
  type CleaningCondition,
  type CleaningSupplies,
} from '../../../shared/cleaningPricing'

export const cleaningPricingPublicRoutes = new Hono<AppEnv>()
export const cleaningPricingAdminRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Config load / seed
// ---------------------------------------------------------------------------

interface ConfigRow {
  id: string
  config_json: string
  version: number
}

/** Load the active config, seeding launch defaults on first read. */
export async function ensureCleaningPricingConfig(env: Env): Promise<{ id: string; version: number; config: CleaningPricingConfig }> {
  const row = await env.DB.prepare(
    'SELECT id, config_json, version FROM cleaning_pricing_config WHERE is_active=1 ORDER BY updated_at DESC LIMIT 1',
  ).first<ConfigRow>()
  if (row) {
    let parsed: CleaningPricingConfig
    try {
      parsed = parseCleaningConfig(JSON.parse(row.config_json))
    } catch {
      parsed = DEFAULT_CLEANING_CONFIG
    }
    return { id: row.id, version: row.version, config: parsed }
  }
  const id = uuid()
  const json = JSON.stringify(DEFAULT_CLEANING_CONFIG)
  await env.DB.prepare(
    'INSERT INTO cleaning_pricing_config (id, config_json, version, is_active) VALUES (?, ?, ?, 1)',
  ).bind(id, json, DEFAULT_CLEANING_CONFIG.version).run()
  return { id, version: DEFAULT_CLEANING_CONFIG.version, config: DEFAULT_CLEANING_CONFIG }
}

// ---------------------------------------------------------------------------
// Input coercion
// ---------------------------------------------------------------------------

const SERVICES: CleaningServiceType[] = ['str_turnover', 'residential_standard', 'deep', 'move_in_out']
const COUNTIES: CleaningCounty[] = ['miami_dade', 'broward', 'palm_beach']
const FREQ: CleaningFrequency[] = ['one_time', 'weekly', 'biweekly', 'monthly']
const CONDITIONS: CleaningCondition[] = ['light', 'standard', 'heavy', 'excessive']

function coerceQuoteInput(body: Record<string, unknown>): CleaningQuoteInput | null {
  const service = SERVICES.includes(body.service as CleaningServiceType) ? (body.service as CleaningServiceType) : null
  const county = COUNTIES.includes(body.county as CleaningCounty) ? (body.county as CleaningCounty) : null
  if (!service || !county) return null
  const bedrooms = Math.max(0, Math.min(20, Math.round(Number(body.bedrooms) || 0)))
  const bathrooms = body.bathrooms == null ? undefined : Math.max(0, Math.min(20, Math.round(Number(body.bathrooms) || 0)))
  const squareFeet = body.squareFeet == null ? undefined : Math.max(0, Math.min(50000, Math.round(Number(body.squareFeet) || 0)))
  const frequency = FREQ.includes(body.frequency as CleaningFrequency) ? (body.frequency as CleaningFrequency) : undefined
  const condition = CONDITIONS.includes(body.condition as CleaningCondition) ? (body.condition as CleaningCondition) : undefined
  const supplies = body.supplies === 'client' || body.supplies === 'pinnacle' ? (body.supplies as CleaningSupplies) : undefined
  const addons: Record<string, boolean | number> = {}
  if (body.addons && typeof body.addons === 'object' && !Array.isArray(body.addons)) {
    for (const [key, value] of Object.entries(body.addons as Record<string, unknown>).slice(0, 40)) {
      if (typeof value === 'boolean') addons[key] = value
      else if (typeof value === 'number' && Number.isFinite(value)) addons[key] = Math.max(0, Math.min(50, Math.round(value)))
    }
  }
  return {
    service,
    county,
    bedrooms,
    bathrooms,
    squareFeet,
    frequency,
    condition,
    supplies,
    addons,
    isFirstRecurring: body.isFirstRecurring === true,
  }
}

/** Customer-safe view of the config: no commercial/payout economics. */
function publicConfigView(config: CleaningPricingConfig) {
  return {
    currency: config.currency,
    territories: config.territories.filter((t) => t.enabled).map((t) => ({ key: t.key, label: t.label })),
    services: config.services
      .filter((s) => s.enabled)
      .map((s) => ({
        key: s.key,
        label: s.label,
        recurringEligible: s.recurringEligible,
        tiers: s.tiers.map((t) => ({ key: t.key, label: t.label, maxBedrooms: t.maxBedrooms, fromCents: t.fromCents })),
      })),
    addons: config.addons
      .filter((a) => a.enabled)
      .map((a) => ({ key: a.key, label: a.label, priceCents: a.priceCents, perUnit: a.perUnit, needsReview: a.needsReview, disabledCounties: a.disabledCounties, hint: a.hint || null })),
    frequencyDiscounts: config.frequencyDiscounts,
    conditionMultipliers: config.conditionMultipliers.map((c) => ({ key: c.key, label: c.label })),
    promotion: config.promotions.find((p) => p.active && p.type === 'first_recurring_percent')
      ? (() => {
          const p = config.promotions.find((x) => x.active && x.type === 'first_recurring_percent')!
          return { id: p.id, label: p.label, percent: p.percent }
        })()
      : null,
    startingPrices: startingPrices(config),
  }
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

cleaningPricingPublicRoutes.get('/public/cleaning/config', async (c) => {
  const { config } = await ensureCleaningPricingConfig(c.env)
  return c.json(publicConfigView(config))
})

cleaningPricingPublicRoutes.post('/public/cleaning/quote', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const input = coerceQuoteInput(body)
  if (!input) return c.json({ error: 'Choose a service and a service area to get a price.' }, 400)
  const { config } = await ensureCleaningPricingConfig(c.env)
  const result = priceCleaning(config, input)
  return c.json({ quote: toCustomerQuote(result) })
})

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

cleaningPricingAdminRoutes.get('/cleaning/pricing-config', requireStaff, async (c) => {
  const { id, version, config } = await ensureCleaningPricingConfig(c.env)
  return c.json({ id, version, config })
})

// Full internal quote for HQ dispatch previews: includes payout + margin.
cleaningPricingAdminRoutes.post('/cleaning/pricing-quote', requireStaff, async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const input = coerceQuoteInput(body)
  if (!input) return c.json({ error: 'Missing service or service area.' }, 400)
  const { config } = await ensureCleaningPricingConfig(c.env)
  return c.json({ quote: priceCleaning(config, input) })
})

cleaningPricingAdminRoutes.put('/cleaning/pricing-config', requireOwner, async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  if (!body.config || typeof body.config !== 'object') return c.json({ error: 'Missing config document.' }, 400)

  const current = await ensureCleaningPricingConfig(c.env)
  const next = parseCleaningConfig(body.config)
  next.version = current.version + 1

  // Snapshot the prior document for auditability, then update in place.
  await c.env.DB.prepare(
    'INSERT INTO cleaning_pricing_config_versions (id, config_id, version, config_json, changed_by_user_id) VALUES (?, ?, ?, ?, ?)',
  ).bind(uuid(), current.id, current.version, JSON.stringify(current.config), user.id).run()

  await c.env.DB.prepare(
    'UPDATE cleaning_pricing_config SET config_json=?, version=?, updated_by_user_id=?, updated_at=datetime(\'now\') WHERE id=?',
  ).bind(JSON.stringify(next), next.version, user.id, current.id).run()

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'cleaning_pricing_updated',
    entityType: 'cleaning_pricing_config',
    entityId: current.id,
    after: { version: next.version },
  }).catch(() => {})

  return c.json({ id: current.id, version: next.version, config: next })
})
