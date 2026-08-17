import type { Env } from './types'

// Field-location retention runner. Called by the scheduled
// field_location_retention automation to prune high-frequency raw
// points from field_location_points beyond the configured window.
//
// The session summary rows in field_location_sessions carry the
// meaningful lifecycle evidence (start_lat/lng, last_lat/lng,
// started_at, ended_at, ended_reason, point_count). Those rows are
// NEVER pruned by this pass - only the raw stream is. That matches
// the spec's guidance:
//
//   "preserving durable assignment milestones separately from the raw
//    high-frequency trail so old raw points can eventually be reduced/
//    purged while important evidence such as tracking started,
//    arrival, departure, completion remains associated with the
//    assignment"
//
// Defaults:
//   - retention window: 90 days
//   - per-run cap: 5,000 rows so a single run cannot lock D1 for
//     minutes if the backlog is huge; subsequent runs continue draining
//
// Overrides:
//   Reads automation_controls.config_json[.retention_days] if a value
//   is set there, matching the pattern the other automations already
//   use for per-firm knobs.

export interface FieldLocationRetentionResult {
  processed: number
  sent: number
  failed: number
  skipped: number
  retention_days: number
  cutoff_iso: string
  remaining_estimate: number | null
}

const DEFAULT_RETENTION_DAYS = 90
const DEFAULT_MAX_PER_RUN = 5000
const MIN_RETENTION_DAYS = 7
const MAX_RETENTION_DAYS = 365 * 5

interface RetentionConfig {
  retention_days?: number
  max_per_run?: number
}

async function loadRetentionConfig(env: Env): Promise<RetentionConfig> {
  try {
    const row = await env.DB.prepare(
      "SELECT config_json FROM automation_controls WHERE automation_key = 'field_location_retention'",
    ).first<{ config_json: string | null }>()
    if (!row?.config_json) return {}
    return JSON.parse(row.config_json) as RetentionConfig
  } catch {
    return {}
  }
}

function clampNumber(value: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, Math.trunc(n)))
}

export async function runFieldLocationRetention(env: Env): Promise<FieldLocationRetentionResult> {
  const config = await loadRetentionConfig(env)
  const retentionDays = clampNumber(config.retention_days, DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS)
  const maxPerRun = clampNumber(config.max_per_run, DEFAULT_MAX_PER_RUN, 100, 50_000)
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()

  // Delete raw points beyond the cutoff, capped so a single run does
  // not lock D1. We intentionally do NOT touch field_location_sessions -
  // its ended_at + last_seen_at + start/last coordinates remain the
  // audit-preserving milestones.
  const deleted = await env.DB.prepare(
    `DELETE FROM field_location_points
       WHERE id IN (
         SELECT id FROM field_location_points
           WHERE captured_at < ?
           LIMIT ?
       )`,
  ).bind(cutoff, maxPerRun).run()

  // Ask for a rough backlog estimate so the automation dashboard can
  // show progress and know whether another run is needed soon.
  let remaining: number | null = null
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM field_location_points WHERE captured_at < ?',
    ).bind(cutoff).first<{ n: number }>()
    remaining = Number(row?.n ?? 0)
  } catch {
    remaining = null
  }

  const processed = Number(deleted.meta?.changes ?? 0)
  return {
    processed,
    sent: processed,
    failed: 0,
    skipped: 0,
    retention_days: retentionDays,
    cutoff_iso: cutoff,
    remaining_estimate: remaining,
  }
}
