-- PMV E-Sign evidence foundation (master spec §3.2, §6, §9, §11, §12)
-- Adds document version semantics, versioned consent policies, the signing
-- key registry, privileged MFA credentials, and envelope consent binding.

-- document_files version/authority semantics (spec §3.2). SQLite cannot add
-- FK constraints via ALTER TABLE, so parent_version_id is a plain column.
ALTER TABLE document_files ADD COLUMN version_number INTEGER;
ALTER TABLE document_files ADD COLUMN parent_version_id TEXT;
ALTER TABLE document_files ADD COLUMN is_authoritative INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_files ADD COLUMN is_executed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_files ADD COLUMN is_derivative INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing lineage rows are authoritative; signed PDFs are executed.
UPDATE document_files SET version_number = 1,
  is_authoritative = 1
  WHERE kind IN ('source','canonical_pdf','signed_pdf','audit_certificate','evidence_manifest');
UPDATE document_files SET is_executed = 1 WHERE kind = 'signed_pdf';

-- Versioned consent policies (spec §9)
CREATE TABLE IF NOT EXISTS consent_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'standard' CHECK (category IN ('standard','consumer_esign')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consent_policy_versions (
  id TEXT PRIMARY KEY,
  consent_policy_id TEXT NOT NULL REFERENCES consent_policies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body_html TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(consent_policy_id, version)
);

CREATE TABLE IF NOT EXISTS signer_consents (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES envelope_recipients(id) ON DELETE RESTRICT,
  consent_policy_version_id TEXT NOT NULL REFERENCES consent_policy_versions(id) ON DELETE RESTRICT,
  accepted_at TEXT NOT NULL,
  session_id TEXT,
  ip_address TEXT,
  UNIQUE(recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_signer_consents_recipient ON signer_consents(recipient_id);

-- Envelope binds the consent policy version in force at send time (spec §3.3).
ALTER TABLE envelopes ADD COLUMN consent_policy_version_id TEXT;
ALTER TABLE envelopes ADD COLUMN execution_type TEXT NOT NULL DEFAULT 'E_SIGN'
  CHECK (execution_type IN ('E_SIGN','RON','IN_PERSON','MOBILE_NOTARY'));

-- Signing key registry (spec §6): explicit key IDs, rotation, revocation.
CREATE TABLE IF NOT EXISTS signing_keys (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL UNIQUE,
  algorithm TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotated','revoked')),
  public_key_b64 TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Privileged MFA credentials (spec §11). Secret encrypted at rest with
-- SESSION_SECRET via encryptSensitive(); recovery codes stored as SHA-256.
CREATE TABLE IF NOT EXISTS mfa_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  recovery_code_hashes TEXT NOT NULL DEFAULT '[]',
  enabled_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_mfa_credentials_user ON mfa_credentials(user_id);