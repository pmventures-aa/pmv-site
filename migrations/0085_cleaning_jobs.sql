-- Cleaning jobs: the operational record for a booked cleaning across all
-- services (Airbnb/STR turnover, residential standard, deep, move-in/out).
--
-- A job stores the authoritative quote snapshot taken at booking time (client
-- price + the internal vendor payout and margin), the property/contact details,
-- scheduling, assignment, field timestamps, and payment status. Retail price and
-- vendor economics live on the same row but are only returned to staff routes;
-- the vendor and client surfaces never receive payout/margin.
--
-- The richer STR managed operational layer (per-property checklists, required
-- photos, supplies, iCal reservations) already exists in migration 0076 and is
-- reused for managed STR properties; cleaning_jobs is the general booking →
-- dispatch → completion entity for calculator-originated work.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cleaning_jobs (
  id                        TEXT PRIMARY KEY,
  reference                 TEXT NOT NULL UNIQUE,          -- short human code, e.g. CLN-3F9K
  service_type              TEXT NOT NULL,                 -- str_turnover | residential_standard | deep | move_in_out
  service_label             TEXT NOT NULL,
  county                    TEXT NOT NULL,                 -- miami_dade | broward | palm_beach
  tier_key                  TEXT,
  tier_label                TEXT,
  bedrooms                  INTEGER NOT NULL DEFAULT 0,
  bathrooms                 INTEGER NOT NULL DEFAULT 1,
  square_feet               INTEGER,
  frequency                 TEXT NOT NULL DEFAULT 'one_time',
  condition                 TEXT NOT NULL DEFAULT 'standard',
  supplies                  TEXT NOT NULL DEFAULT 'pinnacle',
  addons_json               TEXT NOT NULL DEFAULT '{}',
  is_first_recurring        INTEGER NOT NULL DEFAULT 0,

  -- Quote snapshot (authoritative, computed server-side at booking).
  pricing_version           INTEGER,
  client_total_cents        INTEGER NOT NULL DEFAULT 0,
  base_cents                INTEGER NOT NULL DEFAULT 0,
  addons_cents              INTEGER NOT NULL DEFAULT 0,
  recurring_discount_cents  INTEGER NOT NULL DEFAULT 0,
  promo_discount_cents      INTEGER NOT NULL DEFAULT 0,
  tax_cents                 INTEGER NOT NULL DEFAULT 0,
  -- Internal economics: never sent to client/vendor surfaces.
  vendor_payout_cents       INTEGER NOT NULL DEFAULT 0,
  margin_cents              INTEGER NOT NULL DEFAULT 0,
  margin_percent            REAL NOT NULL DEFAULT 0,
  below_min_margin          INTEGER NOT NULL DEFAULT 0,
  below_minimum_job         INTEGER NOT NULL DEFAULT 0,
  needs_review              INTEGER NOT NULL DEFAULT 0,
  review_reasons_json       TEXT NOT NULL DEFAULT '[]',

  -- Who + where.
  client_user_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
  contact_name              TEXT,
  contact_email             TEXT,
  contact_phone             TEXT,
  property_address          TEXT,
  property_unit             TEXT,

  -- Scheduling.
  scheduled_date            TEXT,                          -- YYYY-MM-DD
  arrival_window            TEXT,
  guest_checkout_at         TEXT,                          -- STR turnover countdown (ISO)
  guest_checkin_at          TEXT,                          -- STR next check-in (ISO)

  -- Assignment + lifecycle.
  status                    TEXT NOT NULL DEFAULT 'requested',
  assigned_vendor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  offered_vendor_ids_json   TEXT NOT NULL DEFAULT '[]',
  assigned_by_user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at               TEXT,
  accepted_at               TEXT,
  en_route_at               TEXT,
  arrived_at                TEXT,
  started_at                TEXT,
  completed_at              TEXT,
  cancelled_at              TEXT,
  cancel_reason             TEXT,

  -- Payout + payment.
  payout_status             TEXT NOT NULL DEFAULT 'pending', -- pending | approved | paid
  payout_approved_at        TEXT,
  payout_approved_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  payment_status            TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | paid | invoiced | waived

  source                    TEXT NOT NULL DEFAULT 'public_calculator',
  notes_internal            TEXT,
  notes_client_safe         TEXT,
  created_by_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_status_date ON cleaning_jobs(status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_vendor ON cleaning_jobs(assigned_vendor_user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_client ON cleaning_jobs(client_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_county ON cleaning_jobs(county, status);

-- Status history / dispatch audit for each job.
CREATE TABLE IF NOT EXISTS cleaning_job_events (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES cleaning_jobs(id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,                            -- status_change | assigned | offered | note | payout
  from_status     TEXT,
  to_status       TEXT,
  detail          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_job_events_job ON cleaning_job_events(job_id, created_at);

-- Client notification catalog entries (reuse existing notification pipeline).
INSERT OR IGNORE INTO notification_event_catalog(event_key,label,category,audience,description,default_in_app,default_email,client_configurable,sort_order) VALUES
('cleaning.booking_received', 'Cleaning booking received', 'Cleaning', 'client', 'We received your cleaning request.', 1, 1, 1, 310),
('cleaning.scheduled', 'Cleaning scheduled', 'Cleaning', 'client', 'Your cleaning is scheduled.', 1, 1, 1, 320),
('cleaning.vendor_assigned', 'Cleaner assigned', 'Cleaning', 'client', 'A cleaner has been assigned to your job.', 1, 0, 1, 330),
('cleaning.completed', 'Cleaning completed', 'Cleaning', 'client', 'Your cleaning is complete.', 1, 1, 1, 340);

INSERT OR IGNORE INTO automation_controls(automation_key, enabled, notes) VALUES
('cleaning_operations', 1, 'Cleaning dispatch monitoring: unassigned, at-risk, and needs-review detection.');
