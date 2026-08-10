PRAGMA foreign_keys = ON;

CREATE TABLE service_offerings (
  id TEXT PRIMARY KEY,
  service_key TEXT NOT NULL REFERENCES services(key) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  starting_price_cents INTEGER,
  pricing_label TEXT,
  badge TEXT,
  requirements_json TEXT,
  client_note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  provider_payout_min_cents INTEGER,
  provider_payout_max_cents INTEGER,
  provider_payout_notes TEXT,
  required_documents_json TEXT,
  intake_prompts_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_service_offerings_service ON service_offerings(service_key, active, sort_order, name);
CREATE INDEX idx_service_offerings_active ON service_offerings(active, service_key);
