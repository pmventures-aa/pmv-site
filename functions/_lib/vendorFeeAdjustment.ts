import type { Env } from './types'
import {
  computeLocalVendorFeeAdjustment,
  medianCents,
  parseVendorFeeSettings,
  type VendorFeeEstimate,
  type VendorFeeSettings,
} from '../../shared/vendorFeeAdjustment'

const SETTINGS_KEYS = {
  enabled: 'dispatch_local_fee_adjustment_enabled',
  maxAdjustmentCents: 'dispatch_local_fee_max_adjustment_cents',
  downOnly: 'dispatch_local_fee_down_only',
} as const

export async function loadVendorFeeSettings(env: Env): Promise<VendorFeeSettings> {
  const rows = await env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)`,
  ).bind(SETTINGS_KEYS.enabled, SETTINGS_KEYS.maxAdjustmentCents, SETTINGS_KEYS.downOnly).all<{ key: string; value: string | null }>()
  const map = new Map((rows.results || []).map((row) => [row.key, row.value]))
  return parseVendorFeeSettings({
    enabled: map.get(SETTINGS_KEYS.enabled) ?? '1',
    max_adjustment_cents: map.get(SETTINGS_KEYS.maxAdjustmentCents),
    down_only: map.get(SETTINGS_KEYS.downOnly) ?? '0',
  })
}

export async function saveVendorFeeSettings(env: Env, settings: VendorFeeSettings): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(SETTINGS_KEYS.enabled, settings.enabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(SETTINGS_KEYS.maxAdjustmentCents, String(settings.maxAdjustmentCents)),
    env.DB.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(SETTINGS_KEYS.downOnly, settings.downOnly ? '1' : '0'),
  ])
}

function postalPrefix(postal: string | null | undefined): string | null {
  const digits = (postal || '').replace(/\D/g, '')
  if (digits.length < 3) return null
  return digits.slice(0, 3)
}

function areaLabel(input: { site_city?: string | null; site_state?: string | null; site_postal_code?: string | null }): string {
  if (input.site_city && input.site_state) return `${input.site_city}, ${input.site_state}`
  const prefix = postalPrefix(input.site_postal_code)
  if (prefix) return `ZIP ${prefix}`
  return 'this area'
}

async function lookupBaseFeeCents(env: Env, serviceKey: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT provider_payout_min_cents, provider_payout_max_cents, starting_price_cents
     FROM service_offerings
     WHERE active = 1 AND service_key = ?
     ORDER BY
       CASE WHEN provider_payout_min_cents IS NOT NULL THEN 0 ELSE 1 END,
       sort_order, name
     LIMIT 1`,
  ).bind(serviceKey).first<{
    provider_payout_min_cents: number | null
    provider_payout_max_cents: number | null
    starting_price_cents: number | null
  }>()

  if (!row) return 0
  if (typeof row.provider_payout_min_cents === 'number' && typeof row.provider_payout_max_cents === 'number') {
    return Math.round((row.provider_payout_min_cents + row.provider_payout_max_cents) / 2)
  }
  if (typeof row.provider_payout_min_cents === 'number') return row.provider_payout_min_cents
  if (typeof row.provider_payout_max_cents === 'number') return row.provider_payout_max_cents
  if (typeof row.starting_price_cents === 'number') return Math.round(row.starting_price_cents * 0.55)
  return 0
}

async function lookupMarketPayouts(
  env: Env,
  serviceKey: string,
  postal: string | null | undefined,
): Promise<{ median: number | null; sampleSize: number }> {
  const prefix = postalPrefix(postal)
  if (!prefix) return { median: null, sampleSize: 0 }

  const rows = await env.DB.prepare(
    `SELECT vendor_fee_cents
     FROM field_assignments
     WHERE service_key = ?
       AND vendor_fee_cents IS NOT NULL
       AND vendor_fee_cents > 0
       AND status IN ('completed', 'assigned', 'traveling', 'on_site', 'documented', 'signed')
       AND site_postal_code IS NOT NULL
       AND replace(site_postal_code, ' ', '') LIKE ?
       AND created_at >= datetime('now', '-120 days')
     ORDER BY created_at DESC
     LIMIT 24`,
  ).bind(serviceKey, `${prefix}%`).all<{ vendor_fee_cents: number }>()

  const values = (rows.results || []).map((row) => row.vendor_fee_cents)
  return { median: medianCents(values), sampleSize: values.length }
}

export async function estimateVendorFee(
  env: Env,
  input: {
    service_key: string
    site_postal_code?: string | null
    site_city?: string | null
    site_state?: string | null
    base_cents?: number | null
  },
): Promise<VendorFeeEstimate> {
  const settings = await loadVendorFeeSettings(env)
  const baseCents = input.base_cents && input.base_cents > 0
    ? Math.round(input.base_cents)
    : await lookupBaseFeeCents(env, input.service_key)
  const market = await lookupMarketPayouts(env, input.service_key, input.site_postal_code)
  const adjusted = computeLocalVendorFeeAdjustment({
    baseCents,
    marketMedianCents: market.median,
    sampleSize: market.sampleSize,
    settings,
    areaLabel: areaLabel(input),
  })

  return {
    baseCents,
    adjustmentCents: adjusted.adjustmentCents,
    offeredCents: adjusted.offeredCents,
    reason: adjusted.reason,
    marketMedianCents: market.median,
    sampleSize: market.sampleSize,
    settings,
  }
}
