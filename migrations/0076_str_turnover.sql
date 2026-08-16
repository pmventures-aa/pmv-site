-- STR Turnover & Property Support vertical.
-- Adds the turnover service catalog entry, packages/pricing, STR property
-- profiles (with secure access credentials kept separate), checklist
-- templates, turnovers, photos, issues, supplies, reservation calendars
-- (iCal feed foundation), leads, and event/automation seeds.
PRAGMA foreign_keys = ON;

-- ---- Service catalog entry ----
INSERT OR IGNORE INTO services (key, name, description, category, sort_order) VALUES
('str_turnover', 'STR Turnover & Property Support', 'Guest-ready turnover cleaning and property support for short-term rental hosts.', 'property', 40);

-- ---- Service packages ----
CREATE TABLE IF NOT EXISTS str_service_packages (
  key                TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT,
  badge              TEXT,
  monthly_rate_cents INTEGER,                       -- set only for managed
  active             INTEGER NOT NULL DEFAULT 1,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Client-facing price + provider payout for each tier. The server computes
-- turnover charges/payouts from these rows; they are never hardcoded in the
-- UI. max_bedrooms NULL = 5+ catch-all tier.
CREATE TABLE IF NOT EXISTS str_price_tiers (
  id                   TEXT PRIMARY KEY,
  package_key          TEXT NOT NULL REFERENCES str_service_packages(key) ON DELETE CASCADE,
  tier_key             TEXT NOT NULL,
  tier_label           TEXT NOT NULL,
  max_bedrooms         INTEGER,
  starting_from        INTEGER NOT NULL DEFAULT 0,
  client_price_cents   INTEGER NOT NULL,
  provider_payout_cents INTEGER NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(package_key, tier_key)
);

-- ---- STR property profile (1:1 with an existing properties row) ----
CREATE TABLE IF NOT EXISTS str_properties (
  property_id               TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  client_user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname                  TEXT,
  platform                  TEXT,                       -- airbnb | vrbo | other | multiple
  platform_url              TEXT,
  bedrooms                  INTEGER,
  bathrooms                 TEXT,
  max_guests                INTEGER,
  checkout_time             TEXT,                       -- HH:MM
  checkin_time              TEXT,                       -- HH:MM
  turnover_window_minutes   INTEGER NOT NULL DEFAULT 180,
  access_instructions       TEXT,
  building_entry            TEXT,
  parking                   TEXT,
  supplies_notes            TEXT,
  staging_notes             TEXT,
  linen_config_json         TEXT NOT NULL DEFAULT '{}',
  required_completion_photos_json TEXT NOT NULL DEFAULT '[]',
  service_package_key       TEXT REFERENCES str_service_packages(key),
  primary_provider_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  backup_provider_user_ids_json TEXT NOT NULL DEFAULT '[]',
  supply_tracking_enabled   INTEGER NOT NULL DEFAULT 0,
  priority_dispatch         INTEGER NOT NULL DEFAULT 0,
  managed_monthly_rate_cents INTEGER,
  auto_create_turnovers     INTEGER NOT NULL DEFAULT 0,
  active                    INTEGER NOT NULL DEFAULT 1,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_str_properties_client ON str_properties(client_user_id);

-- Secure access credentials for a property. Never exposed on the public site
-- or the client portal; only assigned providers and authorized staff read
-- these. Kept separate from client-visible profile fields on purpose.
CREATE TABLE IF NOT EXISTS str_property_access (
  id                TEXT PRIMARY KEY,
  property_id       TEXT NOT NULL REFERENCES str_properties(property_id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  entry_method      TEXT,                               -- lockbox | code | smart_lock | key | other
  code_value        TEXT,
  lockbox_location  TEXT,
  instructions      TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_str_access_property ON str_property_access(property_id);

-- ---- Checklist templates (global + per-property overrides) ----
CREATE TABLE IF NOT EXISTS str_checklist_templates (
  id          TEXT PRIMARY KEY,
  property_id TEXT REFERENCES str_properties(property_id) ON DELETE CASCADE,  -- NULL = global template
  category    TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  label       TEXT NOT NULL,
  instructions TEXT,
  required    INTEGER NOT NULL DEFAULT 1,
  photo_required INTEGER NOT NULL DEFAULT 0,
  issue_required INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_str_templates_property ON str_checklist_templates(property_id, active);

-- ---- Turnovers ----
CREATE TABLE IF NOT EXISTS turnovers (
  id                        TEXT PRIMARY KEY,
  property_id               TEXT NOT NULL REFERENCES str_properties(property_id) ON DELETE CASCADE,
  client_user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id                 TEXT REFERENCES matters(id) ON DELETE SET NULL,
  calendar_event_id         TEXT REFERENCES calendar_events(id) ON DELETE SET NULL,
  service_package_key       TEXT REFERENCES str_service_packages(key),
  status                    TEXT NOT NULL DEFAULT 'scheduled',
  turnover_date             TEXT NOT NULL,               -- YYYY-MM-DD (arrival day)
  checkout_at               TEXT,                        -- ISO / UTC
  required_complete_at      TEXT,                        -- ISO / UTC deadline
  started_at                TEXT,
  completed_at              TEXT,
  assigned_provider_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  offered_provider_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider_payout_cents     INTEGER,
  payout_status             TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | paid | disputed
  payout_approved_at        TEXT,
  payout_approved_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  client_charge_cents       INTEGER,
  guest_ready_override      INTEGER NOT NULL DEFAULT 0,
  guest_ready_override_at   TEXT,
  guest_ready_override_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  guest_ready_override_reason TEXT,
  source                    TEXT NOT NULL DEFAULT 'manual',  -- manual | reservation | recurring
  reservation_id            TEXT REFERENCES str_reservations(id) ON DELETE SET NULL,
  notes_internal            TEXT,
  created_by_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_turnovers_property_date ON turnovers(property_id, turnover_date);
CREATE INDEX IF NOT EXISTS idx_turnovers_client ON turnovers(client_user_id, turnover_date);
CREATE INDEX IF NOT EXISTS idx_turnovers_status_date ON turnovers(status, turnover_date);
CREATE INDEX IF NOT EXISTS idx_turnovers_provider ON turnovers(assigned_provider_user_id, turnover_date);

-- ---- Per-turnover checklist items (materialized from templates at creation) ----
CREATE TABLE IF NOT EXISTS turnover_checklist_items (
  id                    TEXT PRIMARY KEY,
  turnover_id           TEXT NOT NULL REFERENCES turnovers(id) ON DELETE CASCADE,
  template_id           TEXT REFERENCES str_checklist_templates(id) ON DELETE SET NULL,
  category              TEXT NOT NULL,
  item_key              TEXT NOT NULL,
  label                 TEXT NOT NULL,
  instructions          TEXT,
  required              INTEGER NOT NULL DEFAULT 1,
  photo_required        INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | complete | not_applicable
  not_applicable_reason TEXT,
  completed_at          TEXT,
  completed_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_turnover_items_turnover ON turnover_checklist_items(turnover_id);

-- ---- Turnover photos (stored in R2, metadata here) ----
CREATE TABLE IF NOT EXISTS turnover_photos (
  id                  TEXT PRIMARY KEY,
  turnover_id         TEXT NOT NULL REFERENCES turnovers(id) ON DELETE CASCADE,
  checklist_item_id   TEXT REFERENCES turnover_checklist_items(id) ON DELETE SET NULL,
  issue_id            TEXT REFERENCES turnover_issues(id) ON DELETE SET NULL,
  object_key          TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  content_type        TEXT,
  size_bytes          INTEGER,
  label               TEXT,
  captured_at         TEXT,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_turnover_photos_turnover ON turnover_photos(turnover_id);

-- ---- Turnover issues / exceptions ----
CREATE TABLE IF NOT EXISTS turnover_issues (
  id                           TEXT PRIMARY KEY,
  turnover_id                  TEXT NOT NULL REFERENCES turnovers(id) ON DELETE CASCADE,
  client_user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_type                   TEXT NOT NULL,
  severity                     TEXT NOT NULL DEFAULT 'medium',
  description                  TEXT NOT NULL,
  client_summary               TEXT,
  internal_notes               TEXT,
  can_continue                 INTEGER NOT NULL DEFAULT 1,
  affects_guest_readiness      INTEGER NOT NULL DEFAULT 0,
  excess_condition             INTEGER NOT NULL DEFAULT 0,
  status                       TEXT NOT NULL DEFAULT 'open',  -- open | approved | declined | resolved
  excess_payout_adjustment_cents INTEGER,
  excess_client_adjustment_cents INTEGER,
  requires_client_action       INTEGER NOT NULL DEFAULT 0,
  resolved_at                  TEXT,
  resolved_by_user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_turnover_issues_turnover ON turnover_issues(turnover_id, status);

-- ---- Supplies + per-turnover supply observations ----
CREATE TABLE IF NOT EXISTS str_supplies (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES str_properties(property_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  par_level   INTEGER NOT NULL DEFAULT 1,
  stock       INTEGER NOT NULL DEFAULT 1,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_str_supplies_property ON str_supplies(property_id, active);

CREATE TABLE IF NOT EXISTS turnover_supply_status (
  id                  TEXT PRIMARY KEY,
  turnover_id         TEXT NOT NULL REFERENCES turnovers(id) ON DELETE CASCADE,
  supply_id           TEXT NOT NULL REFERENCES str_supplies(id) ON DELETE CASCADE,
  observed_stock      INTEGER NOT NULL,
  flag                TEXT NOT NULL DEFAULT 'good',      -- good | low | out
  notes               TEXT,
  created_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_turnover_supply_status_turnover ON turnover_supply_status(turnover_id);

-- ---- Reservation calendars (iCal/ICS feed foundation) ----
CREATE TABLE IF NOT EXISTS str_reservation_calendars (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES str_properties(property_id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  ical_url      TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_str_calendars_property ON str_reservation_calendars(property_id);

CREATE TABLE IF NOT EXISTS str_reservations (
  id                TEXT PRIMARY KEY,
  calendar_id       TEXT NOT NULL REFERENCES str_reservation_calendars(id) ON DELETE CASCADE,
  external_uid      TEXT NOT NULL,
  title             TEXT,
  start_at          TEXT NOT NULL,       -- check-in
  end_at            TEXT NOT NULL,       -- check-out
  created_turnover_id TEXT REFERENCES turnovers(id) ON DELETE SET NULL,
  raw_json          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(calendar_id, external_uid)
);
CREATE INDEX IF NOT EXISTS idx_str_reservations_calendar ON str_reservations(calendar_id, start_at);

-- ---- STR lead detail (public quote intake) ----
CREATE TABLE IF NOT EXISTS str_leads (
  inquiry_id             TEXT PRIMARY KEY REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  property_count         TEXT,
  property_address       TEXT,
  unit_type              TEXT,
  avg_turnovers_per_month TEXT,
  current_cleaning       TEXT,
  guest_ready_plus       INTEGER NOT NULL DEFAULT 0,
  managed                INTEGER NOT NULL DEFAULT 0,
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Seeds
-- ============================================================
INSERT OR IGNORE INTO str_service_packages (key, name, description, badge, monthly_rate_cents, active, sort_order) VALUES
('guest_ready', 'Guest Ready Turnover',
 'Professional turnover cleaning and guest-ready preparation for one checkout.',
 NULL, NULL, 1, 10),
('guest_ready_plus', 'Guest Ready+',
 'Guest Ready turnover plus expanded photo verification, supply inventory, room-by-room checklist, issue reporting, and staging verification.',
 'Most popular', NULL, 1, 20),
('managed', 'Pinnacle Managed Turnover',
 'Full STR property support: scheduling coordination, primary/backup provider management, priority dispatch, Guest Ready+ reporting, supply monitoring, and escalation handling.',
 'For managers', 9900, 1, 30);

INSERT OR IGNORE INTO str_price_tiers (id, package_key, tier_key, tier_label, max_bedrooms, starting_from, client_price_cents, provider_payout_cents, sort_order) VALUES
('tier-gr-1br', 'guest_ready',       'studio_1br', 'Studio / 1 Bedroom', 1,    0,   13900,  9500, 10),
('tier-gr-2br', 'guest_ready',       'br2',        '2 Bedrooms',         2,    0,   17900, 12000, 20),
('tier-gr-3br', 'guest_ready',       'br3',        '3 Bedrooms',         3,    0,   22900, 15500, 30),
('tier-gr-4br', 'guest_ready',       'br4',        '4 Bedrooms',         4,    0,   29900, 20500, 40),
('tier-gr-5br', 'guest_ready',       'br5_plus',   '5+ Bedrooms',        NULL, 1,   37900, 26000, 50),
('tier-grp-1br','guest_ready_plus',  'studio_1br', 'Studio / 1 Bedroom', 1,    0,   17400, 13200, 10),
('tier-grp-2br','guest_ready_plus',  'br2',        '2 Bedrooms',         2,    0,   21400, 16000, 20),
('tier-grp-3br','guest_ready_plus',  'br3',        '3 Bedrooms',         3,    0,   26400, 19500, 30),
('tier-grp-4br','guest_ready_plus',  'br4',        '4 Bedrooms',         4,    0,   33400, 25000, 40),
('tier-grp-5br','guest_ready_plus',  'br5_plus',   '5+ Bedrooms',        NULL, 1,   41400, 31000, 50);

INSERT OR IGNORE INTO notification_event_catalog(event_key,label,category,audience,description,default_in_app,default_email,client_configurable,sort_order) VALUES
('str.turnover_scheduled', 'Turnover scheduled', 'STR', 'client', 'A turnover is scheduled for your property.', 1, 1, 1, 210),
('str.turnover_at_risk', 'Turnover at risk', 'STR', 'client', 'A turnover needs attention to stay on schedule.', 1, 1, 1, 220),
('str.issue_reported', 'Turnover issue reported', 'STR', 'client', 'A condition was flagged during your turnover.', 1, 1, 1, 230),
('str.guest_ready', 'Property guest ready', 'STR', 'client', 'Your property is guest ready and the report is available.', 1, 1, 1, 240),
('str.supply_low', 'Property supply low', 'STR', 'client', 'A property supply needs restocking.', 1, 1, 1, 250);

INSERT OR IGNORE INTO automation_controls(automation_key, enabled, notes) VALUES
('str_operations', 1, 'STR dispatch monitoring: unassigned, at-risk, and low-supply detection.');

-- Default global checklist templates. Property-specific rows override these
-- by (category, item_key); turnovers materialize their checklist at creation.
INSERT OR IGNORE INTO str_checklist_templates (id, property_id, category, item_key, label, instructions, required, photo_required, issue_required, sort_order) VALUES
('tmpl-access',       NULL, 'Before Starting',   'access',      'Confirm access and check-in details',        'Confirm entry works and review access instructions.', 1, 0, 1, 10),
('tmpl-strip-beds',   NULL, 'Before Starting',   'strip_beds',  'Strip all beds and gather used linens',      'Remove used linens and towels to laundry.', 1, 0, 0, 20),
('tmpl-kitchen-dishes', NULL, 'Kitchen',          'dishes',      'Load dishes and wipe counters',              'Run dishwasher if full; wipe all counters.', 1, 0, 0, 10),
('tmpl-kitchen-trash', NULL, 'Kitchen',          'trash',       'Take out trash and recycling',               NULL, 1, 0, 0, 20),
('tmpl-kitchen-sink', NULL, 'Kitchen',          'sink',        'Scrub sink and faucet',                      NULL, 1, 0, 0, 30),
('tmpl-kitchen-fridge', NULL, 'Kitchen',         'fridge',      'Clear fridge of leftovers',                  'Remove guest food; wipe spills.', 1, 0, 0, 40),
('tmpl-kitchen-appliances', NULL, 'Kitchen',     'appliances',  'Wipe exterior appliances',                   'Fridge, microwave, stove surfaces.', 1, 0, 0, 50),
('tmpl-bath-toilet',  NULL, 'Bathrooms',          'toilet',      'Scrub toilets',                              NULL, 1, 0, 0, 10),
('tmpl-bath-shower',  NULL, 'Bathrooms',          'shower',      'Scrub showers/tubs and glass',               NULL, 1, 0, 0, 20),
('tmpl-bath-mirror',  NULL, 'Bathrooms',          'mirror',      'Clean mirrors and fixtures',                 NULL, 1, 0, 0, 30),
('tmpl-bath-stock',   NULL, 'Bathrooms',          'stock',       'Restock toiletries and paper goods',         'TP, soap, shampoo/conditioner, towels.', 1, 1, 0, 40),
('tmpl-bed-make',     NULL, 'Bedrooms',           'make_beds',   'Make beds with fresh linens',                NULL, 1, 1, 0, 10),
('tmpl-bed-dust',     NULL, 'Bedrooms',           'dust',        'Dust surfaces and nightstands',              NULL, 1, 0, 0, 20),
('tmpl-bed-fluff',    NULL, 'Bedrooms',           'fluff',       'Fluff pillows and arrange throws',           NULL, 1, 0, 0, 30),
('tmpl-living-floors', NULL, 'Living Areas',      'floors',      'Vacuum and mop hard floors',                 NULL, 1, 1, 0, 10),
('tmpl-living-sofa',  NULL, 'Living Areas',        'sofa',        'Vacuum and spot-clean sofas and cushions',   NULL, 1, 0, 0, 20),
('tmpl-living-dust',  NULL, 'Living Areas',        'dust',        'Dust shelves, TV, and surfaces',             NULL, 1, 0, 0, 30),
('tmpl-living-remotes', NULL, 'Living Areas',      'remotes',     'Wipe remotes and light switches',            NULL, 1, 0, 0, 40),
('tmpl-laundry',      NULL, 'Laundry',            'laundry',     'Launder all linens and towels',              'Wash, dry, and fold per staging notes.', 1, 0, 0, 10),
('tmpl-supplies',     NULL, 'Supplies',           'inventory',   'Inventory supplies',                         'Paper goods, soap, coffee, laundry detergent.', 1, 0, 0, 10),
('tmpl-supply-flag',  NULL, 'Supplies',           'flag_low',    'Flag anything below par',                    NULL, 0, 0, 1, 20),
('tmpl-final-walk',   NULL, 'Final Walkthrough',  'walkthrough', 'Walk through; confirm staging and lights',   NULL, 1, 0, 0, 10),
('tmpl-final-photos', NULL, 'Final Walkthrough',  'photos',      'Capture required completion photos',         'Use the photo labels configured for this property.', 1, 1, 0, 20);
