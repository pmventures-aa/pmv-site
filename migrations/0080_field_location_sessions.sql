-- Field-location tracking: session + points
--
-- Pairs with migration 0062 (field_agent_locations), which stores the
-- single most-recent point per user for the live dispatch map. That
-- table stays - it is the fast "current pin" projection. This migration
-- adds the durable record the field-location spec needs:
--
--   field_location_sessions
--     One row per active field-work session (started when the provider
--     goes EN_ROUTE / ON_SITE / WORK_IN_PROGRESS, ended when the
--     assignment completes, is cancelled, or the operator ends the
--     session). Retains the first and last known coordinates and the
--     reason the session ended so an authorized reviewer can see the
--     shape of a field visit without having to page through the raw
--     point stream.
--
--   field_location_points
--     Throttled append-only stream. Sessions carry high-cardinality
--     history; a retention policy can prune old rows without touching
--     the session's start/end/last summary.
--
-- Follow-on PRs wire up the API endpoints, the per-assignment client
-- hook that throttles updates before insert, the dispatch live-map
-- staleness computation, and the geofenced-arrival suggestion.
--
-- Neither table is authoritative for the "current pin" - always join
-- through field_agent_locations for the live map (single row lookup)
-- rather than scanning field_location_points.

CREATE TABLE field_location_sessions (
  id              TEXT PRIMARY KEY,
  assignment_id   TEXT NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','ended')),
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  ended_reason    TEXT
                    CHECK (ended_reason IS NULL OR ended_reason IN (
                      'assignment_completed',
                      'assignment_cancelled',
                      'assignment_failed',
                      'operator_stopped',
                      'timeout',
                      'permission_revoked'
                    )),
  -- Convenience denormalizations kept in sync by the API on start/heartbeat
  -- so the map / history views do not have to scan field_location_points
  -- for the corner-case bounds of the session.
  start_latitude   REAL,
  start_longitude  REAL,
  last_latitude    REAL,
  last_longitude   REAL,
  last_accuracy_m  REAL,
  last_seen_at     TEXT,
  point_count      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_field_location_sessions_assignment ON field_location_sessions(assignment_id);
CREATE INDEX idx_field_location_sessions_provider ON field_location_sessions(provider_id, started_at DESC);
CREATE INDEX idx_field_location_sessions_status ON field_location_sessions(status);
-- Only one active session per assignment. A restart after
-- permission-revoked / operator-stopped should open a NEW session, not
-- re-activate a closed one - the history is the record.
CREATE UNIQUE INDEX uniq_field_location_sessions_active_assignment
  ON field_location_sessions(assignment_id)
  WHERE status = 'active';

CREATE TABLE field_location_points (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES field_location_sessions(id) ON DELETE CASCADE,
  assignment_id    TEXT NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  provider_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude         REAL NOT NULL,
  longitude        REAL NOT NULL,
  accuracy_meters  REAL,
  altitude_meters  REAL,
  heading_degrees  REAL,
  speed_mps        REAL,
  source           TEXT NOT NULL DEFAULT 'browser'
                     CHECK (source IN ('browser','pwa','native','manual','geofence')),
  captured_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_field_location_points_session ON field_location_points(session_id, captured_at);
CREATE INDEX idx_field_location_points_assignment ON field_location_points(assignment_id, captured_at);
CREATE INDEX idx_field_location_points_provider_time ON field_location_points(provider_id, captured_at);

-- Field-location granular permissions. These slot into the granular
-- authorization catalog introduced in migration 0078; the shared
-- catalog in shared/authorization.ts is the source of truth for the
-- typed union, this row just ensures the DB knows the keys so the
-- role-editor UI can list them.
--
-- Legacy mapping: field.location.view_live and .view_history both back
-- off to the existing coarse manage_field_work permission so any role
-- that could already see the dispatch board keeps its live-map view;
-- .export and .manage require an explicit grant because they expose
-- historical location data in bulk.
INSERT OR IGNORE INTO permission_catalog (permission_key, label, description, category, legacy_key, owner_only, step_up)
VALUES
  ('field.location.view_live',    'View live field locations',        'See the current or last-known field location for authorized assignments on the dispatch map.', 'Field & Dispatch', 'manage_team', 0, 0),
  ('field.location.view_history', 'View field location history',      'Review the location trail associated with an assignment (arrival, on-site duration, completion location).', 'Field & Dispatch', 'manage_team', 0, 0),
  ('field.location.export',       'Export field location history',    'Export raw location trails as evidence. Requires step-up verification and is audited.', 'Field & Dispatch', NULL,                0, 1),
  ('field.location.manage',       'Manage location tracking policy',  'Configure geofence radii, retention windows, and tracking overrides for the firm.', 'Field & Dispatch', NULL,                0, 1);
