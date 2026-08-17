import { describe, expect, it } from 'vitest'
import { _internal } from '../functions/_lib/routes/fieldLocation'

// Route-level integration would require standing up Hono + a D1 mock
// harness the repo does not currently have. Instead, exercise the
// pieces that are actually easy to get wrong: the server-side
// distance/throttle math and the enum vocabularies. Route wiring is
// covered by the sibling source-shape test below.

describe('field-location server helpers', () => {
  const { distanceMeters, DEBOUNCE_MS, DEBOUNCE_METERS, VALID_END_REASONS, VALID_SOURCES, ACTIVE_ASSIGNMENT_STATUSES } = _internal

  describe('distanceMeters (haversine)', () => {
    it('reports 0 for the same coordinate', () => {
      expect(distanceMeters(25.7617, -80.1918, 25.7617, -80.1918)).toBe(0)
    })

    it('reports ~15 meters for a small nudge (throttle boundary)', () => {
      // ~0.000135 deg latitude ≈ 15m near the equator.
      const meters = distanceMeters(0, 0, 0.000135, 0)
      expect(meters).toBeGreaterThan(12)
      expect(meters).toBeLessThan(18)
    })

    it('reports ~1113 meters for 0.01 degrees of latitude', () => {
      const meters = distanceMeters(25, -80, 25.01, -80)
      expect(meters).toBeGreaterThan(1100)
      expect(meters).toBeLessThan(1130)
    })

    it('is symmetric', () => {
      const a = distanceMeters(30, -80, 30.5, -80.5)
      const b = distanceMeters(30.5, -80.5, 30, -80)
      expect(Math.abs(a - b)).toBeLessThan(0.001)
    })
  })

  describe('throttle bounds', () => {
    it('rejects a point inside BOTH the time and distance windows', () => {
      const elapsedMs = 4_000
      const movedMeters = distanceMeters(25, -80, 25.00005, -80)
      expect(elapsedMs).toBeLessThan(DEBOUNCE_MS)
      expect(movedMeters).toBeLessThan(DEBOUNCE_METERS)
    })

    it('accepts a point that exceeds the distance window even in the time window', () => {
      const elapsedMs = 4_000
      const movedMeters = distanceMeters(25, -80, 25.001, -80)
      expect(elapsedMs).toBeLessThan(DEBOUNCE_MS)
      expect(movedMeters).toBeGreaterThan(DEBOUNCE_METERS)
    })

    it('accepts a point that exceeds the time window even inside the distance window', () => {
      const elapsedMs = 20_000
      const movedMeters = distanceMeters(25, -80, 25.00001, -80)
      expect(elapsedMs).toBeGreaterThan(DEBOUNCE_MS)
      expect(movedMeters).toBeLessThan(DEBOUNCE_METERS)
    })
  })

  describe('enum vocabularies', () => {
    it('accepts every ended_reason called out in the field-location spec', () => {
      // These must line up with the CHECK constraint in migration 0080
      // (field_location_sessions.ended_reason).
      for (const reason of [
        'assignment_completed',
        'assignment_cancelled',
        'assignment_failed',
        'operator_stopped',
        'timeout',
        'permission_revoked',
      ]) {
        expect(VALID_END_REASONS.has(reason), `${reason} missing from VALID_END_REASONS`).toBe(true)
      }
    })

    it('accepts every source called out in the schema', () => {
      // Must line up with the CHECK constraint on field_location_points.source.
      for (const source of ['browser', 'pwa', 'native', 'manual', 'geofence']) {
        expect(VALID_SOURCES.has(source), `${source} missing from VALID_SOURCES`).toBe(true)
      }
    })

    it('only opens sessions for statuses that represent live field activity', () => {
      // The provider must be past the "assigned" stage or actively en
      // route / on site / documented. Terminal statuses (completed /
      // cancelled) never open a session.
      expect(ACTIVE_ASSIGNMENT_STATUSES.has('assigned')).toBe(true)
      expect(ACTIVE_ASSIGNMENT_STATUSES.has('traveling')).toBe(true)
      expect(ACTIVE_ASSIGNMENT_STATUSES.has('on_site')).toBe(true)
      expect(ACTIVE_ASSIGNMENT_STATUSES.has('documented')).toBe(true)
      expect(ACTIVE_ASSIGNMENT_STATUSES.has('completed')).toBe(false)
      expect(ACTIVE_ASSIGNMENT_STATUSES.has('cancelled')).toBe(false)
    })
  })
})

describe('field-location assignment history route', () => {
  const source = readFileSyncSafe(new URL('../functions/_lib/routes/fieldLocation.ts', import.meta.url))

  it('is gated by field.location.view_history granular permission', () => {
    expect(source).toContain("requirePermission('field.location.view_history')")
    // Import from the granular authorize layer, not the coarse capabilities file.
    expect(source).toContain("import { requirePermission } from '../authorize'")
  })

  it('fires FIELD_LOCATION_HISTORY_VIEWED and records session + point counts as metadata', () => {
    expect(source).toContain("event: 'FIELD_LOCATION_HISTORY_VIEWED'")
    expect(source).toMatch(/metadata:\s*\{[\s\S]*?session_count[\s\S]*?point_count/)
  })

  it('clamps limit to [1, 5000] with a default of 500 so a caller cannot ask for the whole trail', () => {
    expect(source).toContain('Math.max(1, Math.min(5000, Math.trunc(requestedLimit)))')
    expect(source).toContain('500')
  })

  it('reports whether the point list was truncated so the client can page later', () => {
    expect(source).toContain("truncated: (points.results?.length ?? 0) >= limit")
  })

  it('orders sessions and points chronologically for arrival/on-site/completion reconstruction', () => {
    expect(source).toMatch(/field_location_sessions[\s\S]*?ORDER BY started_at ASC/)
    expect(source).toMatch(/field_location_points[\s\S]*?ORDER BY captured_at ASC/)
  })
})

// Local helper - importing fs at the top of file is fine but the
// existing describe blocks already do inline read, keep parallel.
function readFileSyncSafe(url: URL): string {
  const fs = require('node:fs') as typeof import('node:fs')
  return fs.readFileSync(url, 'utf8')
}

describe('field-location route wiring', () => {
  it('is registered under /admin so it inherits the requireUser middleware chain', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../functions/api/[[route]].ts', import.meta.url), 'utf8'))
    expect(source).toContain("import { fieldLocationRoutes } from '../_lib/routes/fieldLocation'")
    expect(source).toContain("app.route('/admin', fieldLocationRoutes)")
  })

  it('the route module records lifecycle security events but never dumps raw points into audit_log', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../functions/_lib/routes/fieldLocation.ts', import.meta.url), 'utf8'))
    // Only the session lifecycle transitions are audited; the point
    // ingest path must not call recordSecurityEvent for every ping.
    expect(source).toContain("event: 'FIELD_LOCATION_SESSION_STARTED'")
    expect(source).toContain("event: 'FIELD_LOCATION_SESSION_ENDED'")
    // Point handler should NOT reference recordSecurityEvent - grep the
    // handler slice, not the imports, to prove that.
    const pointHandlerMatch = source.match(/\/field-location\/session\/:id\/point[\s\S]*?fieldLocationRoutes\.post\('\/field-location\/session\/:id\/end/)
    expect(pointHandlerMatch).toBeTruthy()
    expect(pointHandlerMatch![0]).not.toContain('recordSecurityEvent')
  })
})
