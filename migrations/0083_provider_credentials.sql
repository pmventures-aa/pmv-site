-- Provider credentials: the current, editable source of truth for a provider's
-- insurance, notary commission, background check, and tax details. Distinct
-- from vendor_application_profiles (the immutable submitted application) so HQ
-- can keep these up to date over time -- e.g. when an insurance carrier or
-- policy changes -- without touching the original application record.
-- Additive only.
CREATE TABLE IF NOT EXISTS provider_credentials (
  user_id                      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  insurance_carrier            TEXT,
  insurance_policy_number      TEXT,
  insurance_expires_at         TEXT,
  auto_insurance_carrier       TEXT,
  auto_insurance_policy_number TEXT,
  auto_insurance_expires_at    TEXT,
  notary_commission_number     TEXT,
  notary_state                 TEXT,
  notary_expires_at            TEXT,
  eo_bond_provider             TEXT,
  eo_bond_expires_at           TEXT,
  background_check_status      TEXT,   -- e.g. not_started | pending | cleared | flagged
  background_check_completed_at TEXT,
  w9_on_file                   INTEGER NOT NULL DEFAULT 0,
  ein                          TEXT,
  details_json                 TEXT,   -- flexible extra key/value details HQ tracks
  notes                        TEXT,
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by_user_id           TEXT
);
