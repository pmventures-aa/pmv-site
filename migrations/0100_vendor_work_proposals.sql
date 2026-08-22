-- Vendor work proposals: a detailed offer HQ sends a provider, which the
-- provider accepts or declines, and which staff then release into an actual
-- work order.
--
-- Two tables rather than columns on field_assignments, for two reasons:
--   1. A proposal outlives its outcome. Declined and withdrawn proposals are
--      the useful half of the record - they say who was asked and passed - and
--      they never become assignments, so they have nowhere to live on that
--      table.
--   2. Releasing is a create, not an update. field_assignments stays the table
--      that means "real work exists", which keeps every dispatch board, map,
--      and audit query already written against it correct without a WHERE.
--
-- Written to be re-runnable from any state: everything is IF NOT EXISTS and
-- there is no ALTER TABLE, so re-applying this file against a database that
-- already has it is a no-op rather than an error.

CREATE TABLE IF NOT EXISTS vendor_work_proposals (
  id                    TEXT PRIMARY KEY,
  -- What this becomes on release: 'field' (a site visit) or 'ron' (a remote
  -- online notarization session). Mirrors field_assignments.kind.
  kind                  TEXT NOT NULL DEFAULT 'field',
  service_key           TEXT NOT NULL,
  client_user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_user_id        TEXT NOT NULL REFERENCES users(id),
  created_by_user_id    TEXT REFERENCES users(id),

  title                 TEXT,
  -- The narrative scope. This is what makes the proposal "detailed" - the
  -- provider reads this before deciding, so it is stored in full rather than
  -- truncated into a notes field.
  summary               TEXT,

  site_label            TEXT,
  site_address          TEXT,
  site_city             TEXT,
  site_state            TEXT,
  site_postal_code      TEXT,

  scheduled_at          TEXT,   -- ISO, when the provider is expected
  window_start          TEXT,   -- ISO, earliest acceptable start
  window_end            TEXT,   -- ISO, latest acceptable finish
  respond_by            TEXT,   -- ISO, after which a 'sent' proposal reads as expired

  -- Flat offered amount. When null, the line items are the offer.
  offer_cents           INTEGER,
  offer_notes           TEXT,   -- "includes travel", "mileage billed separately"

  -- draft | sent | accepted | declined | withdrawn | expired | released
  status                TEXT NOT NULL DEFAULT 'draft',
  sent_at               TEXT,
  responded_at          TEXT,
  vendor_response_note  TEXT,

  -- The second approval. released_at is set only when staff turn an accepted
  -- proposal into work, and field_assignment_id points at what it became.
  released_at           TEXT,
  released_by_user_id   TEXT REFERENCES users(id),
  field_assignment_id   TEXT REFERENCES field_assignments(id),

  withdrawn_at          TEXT,
  withdraw_reason       TEXT,

  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The provider app's only query: what is in front of me, newest first.
CREATE INDEX IF NOT EXISTS idx_vendor_work_proposals_vendor ON vendor_work_proposals(vendor_user_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_work_proposals_client ON vendor_work_proposals(client_user_id);
-- Powers the HQ release queue (status = 'accepted') without a table scan.
CREATE INDEX IF NOT EXISTS idx_vendor_work_proposals_status ON vendor_work_proposals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_vendor_work_proposals_assignment ON vendor_work_proposals(field_assignment_id);

-- Itemized scope. amount_cents is per-line and already extended (quantity is
-- shown to the provider for context, not multiplied at read time), so a total
-- is a plain SUM and cannot disagree with what the provider saw.
CREATE TABLE IF NOT EXISTS vendor_work_proposal_items (
  id            TEXT PRIMARY KEY,
  proposal_id   TEXT NOT NULL REFERENCES vendor_work_proposals(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  label         TEXT NOT NULL,
  detail        TEXT,
  quantity      REAL,
  unit          TEXT,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_work_proposal_items_proposal ON vendor_work_proposal_items(proposal_id, position);
