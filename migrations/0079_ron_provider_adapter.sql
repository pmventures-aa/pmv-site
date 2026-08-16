-- RON provider integration (master spec §31-§41): provider registry, remote
-- transaction ledger, and signed webhook inbox. Providers are NOT activated
-- until live credentials are provisioned; the adapter ships with a sandbox
-- provider for contract tests and staged demos.

CREATE TABLE IF NOT EXISTS ron_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  base_url TEXT,
  api_key_encrypted TEXT,
  signing_secret_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','suspended')),
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ron_remote_transactions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ron_providers(id),
  envelope_id TEXT REFERENCES envelopes(id),
  remote_transaction_id TEXT,
  provider_session_url TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','awaiting_signer','in_progress','completed','failed','cancelled','disputed')),
  requested_identity_methods_json TEXT NOT NULL DEFAULT '[]',
  signer_journal_entries_json TEXT NOT NULL DEFAULT '[]',
  fee_currency TEXT,
  fee_amount_cents INTEGER,
  margin_amount_cents INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ron_remote_transactions_provider_ref ON ron_remote_transactions(provider_id, remote_transaction_id);

CREATE TABLE IF NOT EXISTS ron_webhook_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ron_providers(id),
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT,
  error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ron_webhook_provider_event ON ron_webhook_events(provider_id, provider_event_id);

-- Billing for remote notarization (master spec §42): provider catalog pricing
-- and per-transaction charges for margin economics.
CREATE TABLE IF NOT EXISTS ron_pricing (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ron_providers(id),
  service_code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider_fee_cents INTEGER NOT NULL DEFAULT 0,
  pinnacle_markup_cents INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ron_charges (
  id TEXT PRIMARY KEY,
  ron_transaction_id TEXT NOT NULL REFERENCES ron_remote_transactions(id),
  envelope_id TEXT REFERENCES envelopes(id),
  service_code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider_fee_cents INTEGER NOT NULL DEFAULT 0,
  pinnacle_markup_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  billed_to_client INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);