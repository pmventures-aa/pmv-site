CREATE TABLE provider_agreement_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agreement_version TEXT NOT NULL,
  signature_name TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  acceptance_method TEXT NOT NULL DEFAULT 'provider_application',
  UNIQUE(user_id, agreement_version)
);

CREATE INDEX idx_provider_agreement_acceptance_user
  ON provider_agreement_acceptances(user_id, accepted_at DESC);
