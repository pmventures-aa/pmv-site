PRAGMA foreign_keys = ON;

-- Branded quote workspace. Quotes are staff-built (optionally from a reusable
-- template), carry Pinnacle branding on a public token URL, and can be
-- accepted or declined by the recipient without an account. The public token
-- is separate from the internal id so shared links never expose staff-facing
-- identifiers.

CREATE TABLE service_quote_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_key TEXT REFERENCES services(key) ON DELETE SET NULL,
  description TEXT,
  intro_message TEXT,
  terms TEXT,
  line_items_json TEXT NOT NULL DEFAULT '[]',
  valid_days INTEGER NOT NULL DEFAULT 14,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_service_quote_templates_active ON service_quote_templates(active, sort_order, name);

CREATE TABLE service_quotes (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  quote_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','accepted','declined','expired','void')),
  title TEXT NOT NULL,
  client_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  scope_request_id TEXT REFERENCES public_scope_requests(id) ON DELETE SET NULL,
  template_id TEXT REFERENCES service_quote_templates(id) ON DELETE SET NULL,
  service_key TEXT REFERENCES services(key) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_company TEXT,
  property_address TEXT,
  intro_message TEXT,
  scope_notes TEXT,
  terms TEXT,
  pass_through_note TEXT,
  valid_until TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  viewed_at TEXT,
  decided_at TEXT,
  decision_note TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_service_quotes_status ON service_quotes(status, created_at DESC);
CREATE INDEX idx_service_quotes_email ON service_quotes(recipient_email, created_at DESC);
CREATE INDEX idx_service_quotes_client ON service_quotes(client_user_id, created_at DESC);

CREATE TABLE service_quote_line_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES service_quotes(id) ON DELETE CASCADE,
  offering_id TEXT REFERENCES service_offerings(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  is_optional INTEGER NOT NULL DEFAULT 0,
  is_pass_through INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_service_quote_line_items_quote ON service_quote_line_items(quote_id, sort_order);

CREATE TABLE service_quote_events (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES service_quotes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('created','updated','sent','viewed','accepted','declined','voided','expired')),
  actor TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_service_quote_events_quote ON service_quote_events(quote_id, created_at);

-- Starter quote templates matching the expanded public service catalog.
-- Prices align with the 2026 South Florida market benchmarks documented in
-- src/data/serviceOfferings.ts. Staff can edit or archive these in HQ.
INSERT INTO service_quote_templates (id, name, service_key, description, intro_message, terms, line_items_json, valid_days, sort_order) VALUES
  ('tpl-moveout-turnover', 'Move-Out Turnover Package', 'property_management',
   'Move-out clean, turnover coordination, and documented condition inspection for a unit between occupants.',
   'Thank you for the opportunity to quote this turnover. The package below covers the clean, the vendor coordination, and the documented condition report so the unit is ready to list. Pricing is based on the details you provided; access or condition changes are confirmed with you before any adjustment.',
   'Quote valid for the period shown. Final pricing is confirmed after access and condition are verified on site. Photos and completion records are attached to the request. Payment is due on completion unless other terms are agreed in writing.',
   '[{"offering_id":"property-moveout-clean","name":"Move-out / turnover cleaning","description":"Landlord-inspection-grade clean: inside appliances and cabinets, floors, baths, closets, with photo documentation.","quantity":1,"unit_price_cents":42500},{"offering_id":"property-turnover-coordinate","name":"Turnover coordination","description":"Punch list built and tracked across vendors through completion.","quantity":1,"unit_price_cents":29500},{"offering_id":"moveout","name":"Move-out condition inspection","description":"Post-move-out condition documentation suitable for the deposit file.","quantity":1,"unit_price_cents":17500}]',
   14, 10),
  ('tpl-eviction-full', 'Eviction Support - Start to Finish (Non-Legal)', 'property_management',
   'Document preparation, field delivery, filing, milestone tracking, and lockout-day coordination for one Florida eviction.',
   'This quote covers the non-legal work in your eviction from notice through possession. Court filing fees, summons, process-server, and sheriff fees are paid directly to the county and are never marked up; typical amounts are listed for planning. We coordinate with your attorney at any point the case needs one.',
   'Pinnacle Management Ventures is not a law firm and does not provide legal advice or select legal remedies. Documents are prepared at the client''s direction. Government and third-party fees are pass-through at cost. Lockout coordination occurs only after lawful authorization.',
   '[{"offering_id":"eviction-notice-prep","name":"Notice preparation (client-directed)","description":"Florida 3-day or 7-day notice prepared from your instructions and lease details.","quantity":1,"unit_price_cents":7500},{"offering_id":"eviction-notice-posting","name":"Notice delivery / posting visit","description":"Field delivery or posting with timestamped photos and a written delivery record.","quantity":1,"unit_price_cents":9500},{"offering_id":"eviction-file-packet","name":"Filing packet assembly (client-directed)","description":"Complaint, summons, and supporting documents assembled filing-ready with county-specific copies.","quantity":1,"unit_price_cents":22500},{"offering_id":"eviction-filing-run","name":"Courthouse filing run","description":"Physical filing with stamped copies and case-number confirmation returned.","quantity":1,"unit_price_cents":16500},{"offering_id":"eviction-case-tracking","name":"Milestone tracking","description":"Docket watched and reported in plain language: deadlines, judgment, writ issuance.","quantity":1,"unit_price_cents":14500},{"offering_id":"eviction-writ-coordination","name":"Writ / lockout day coordination","description":"Sheriff scheduling, locksmith, on-site documentation, and same-day securing.","quantity":1,"unit_price_cents":29500},{"name":"Estimated county costs (pass-through)","description":"Filing ~$185, summons $10/tenant, process server $40-80/tenant, sheriff writ fee ~$90. Paid to the county at cost.","quantity":1,"unit_price_cents":32500,"is_pass_through":1}]',
   21, 20),
  ('tpl-bpo-volume', 'BPO Photo Program - 10 Orders / Month', 'property_inspections',
   'Committed monthly exterior BPO photo volume at a 10% program rate with SLA turnaround.',
   'This program rate covers ten exterior BPO photo sets per month, shot to your platform checklist with GPS-tagged, timestamped photos and 24-48 hour turnaround. Interior sets, rush orders, and additional volume are available at the program discount.',
   'Program pricing requires the stated monthly volume. Orders past the included ten are billed at the same program rate. Unused orders do not roll over. Either party may end the program with 30 days notice.',
   '[{"offering_id":"bpo-photos-exterior","name":"Exterior BPO photo set (program rate)","description":"Subject from multiple angles, street scenes, address verification, labeled to your checklist. Retail $79; program rate reflects 10% volume discount.","quantity":10,"unit_price_cents":7100}]',
   30, 30),
  ('tpl-rental-inspection-program', 'Rental Inspection Program - 12 Months', 'property_inspections',
   'Monthly exterior and occupancy visit plus quarterly interior condition package for one rental property.',
   'This program keeps documented eyes on the property all year: a monthly exterior and occupancy visit, and a quarterly interior condition package with room-by-room photos. Reports are delivered within 48 hours of each visit.',
   'Visits are scheduled within the first ten days of each period. Interior visits require tenant coordination, which we handle with proper notice. Program pricing requires the full term; cancel with 30 days notice and remaining visits are billed at retail.',
   '[{"offering_id":"occupancy","name":"Monthly exterior + occupancy visit (program rate)","description":"Observable occupancy indicators, exterior condition, photo evidence. Retail $75; program rate reflects volume.","quantity":12,"unit_price_cents":6500},{"offering_id":"interior-appointment","name":"Quarterly interior condition package (program rate)","description":"Room-by-room interior photos and plain-language observations. Retail $165.","quantity":4,"unit_price_cents":14500}]',
   30, 40),
  ('tpl-closing-day', 'Closing Day Package', 'mobile_notary',
   'Loan signing, document courier, and a RON backup session for one closing.',
   'Everything the closing needs handled by one coordinated team: a certified signing agent with the full package printed, a same-day courier return of the signed originals, and a RON session on standby if a signer cannot appear in person.',
   'Signing agent fee includes printing and return-shipping coordination. Florida notarial act fees are statutory and included. The RON backup session is billed only if used.',
   '[{"offering_id":"notary-loan-signing","name":"Loan signing appointment","description":"Certified signing agent: printing, signing appointment, notarizations, document return.","quantity":1,"unit_price_cents":15000},{"offering_id":"courier-roundtrip","name":"Round-trip document courier","description":"Signed originals returned same day with confirmation.","quantity":1,"unit_price_cents":12900},{"offering_id":"ron-single","name":"RON backup session (billed only if used)","description":"Remote Online Notarization standby for a signer who cannot appear.","quantity":1,"unit_price_cents":4500,"is_optional":1}]',
   10, 50),
  ('tpl-ops-onboarding', 'Operations Support Proposal', 'consulting',
   'Discovery session, one workflow review, and the first month of ongoing advisory.',
   'This proposal starts with a discovery session and a documented review of the workflow that hurts most, then moves into a standing monthly advisory engagement. Compare the monthly line against $2,500-4,000/mo market rates for fractional operations support.',
   'The discovery session and workflow review are one-time engagements. The monthly advisory line renews month to month and can be cancelled with 30 days notice. Scope changes are confirmed in writing before billing changes.',
   '[{"offering_id":"consult-discovery","name":"Business operations discovery session","description":"90-minute working session with a written action summary.","quantity":1,"unit_price_cents":19500},{"offering_id":"consult-process-review","name":"Workflow & process review","description":"One core workflow mapped end to end with ranked, written recommendations.","quantity":1,"unit_price_cents":49500},{"offering_id":"consult-retainer","name":"Ongoing operations advisory (first month)","description":"Standing monthly engagement for operational projects and vendor coordination.","quantity":1,"unit_price_cents":150000}]',
   21, 60);

-- Align the instant-quote cleaning rules with the 2026 South Florida market
-- (move-out cleans $180-650+ by size, deep cleans from ~$250) unless staff
-- already tuned them in HQ.
UPDATE public_quote_rules SET base_price_cents = 15000, per_sqft_cents = 13, minimum_price_cents = 15000, updated_at = datetime('now')
  WHERE key = 'clean_standard' AND updated_by_user_id IS NULL;
UPDATE public_quote_rules SET base_price_cents = 25000, per_sqft_cents = 21, minimum_price_cents = 25000, updated_at = datetime('now')
  WHERE key = 'clean_deep' AND updated_by_user_id IS NULL;
UPDATE public_quote_rules SET base_price_cents = 29500, per_sqft_cents = 26, minimum_price_cents = 29500, updated_at = datetime('now')
  WHERE key = 'clean_moveout' AND updated_by_user_id IS NULL;
