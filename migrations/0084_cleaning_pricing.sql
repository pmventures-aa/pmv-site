-- Cleaning & Turnover retail pricing configuration.
--
-- One active JSON config document is the single source of truth for every
-- cleaning quote (public calculator, HQ dispatch pricing, vendor payout, and
-- margin math). The document shape lives in shared/cleaningPricing.ts; the
-- server seeds DEFAULT_CLEANING_CONFIG into this table on first read so the
-- launch defaults are defined in exactly one place and never drift from a SQL
-- seed. HQ edits the active row without a deployment.
--
-- Every save also appends the prior document to the versions table so pricing
-- changes are fully auditable and reversible.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cleaning_pricing_config (
  id                 TEXT PRIMARY KEY,
  config_json        TEXT NOT NULL,
  version            INTEGER NOT NULL DEFAULT 1,
  is_active          INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_pricing_active ON cleaning_pricing_config(is_active);

CREATE TABLE IF NOT EXISTS cleaning_pricing_config_versions (
  id                 TEXT PRIMARY KEY,
  config_id          TEXT NOT NULL REFERENCES cleaning_pricing_config(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  config_json        TEXT NOT NULL,
  changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_pricing_versions_config ON cleaning_pricing_config_versions(config_id, version);
