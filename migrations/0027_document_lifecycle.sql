-- Pinnacle Document Lifecycle foundation
-- This migration establishes envelope/evidence data structures.
-- It does not by itself make the platform RON-compliant.

CREATE TABLE IF NOT EXISTS document_files (
  id TEXT PRIMARY KEY,
  owner_client_id TEXT,
  created_by_user_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('source','canonical_pdf','signed_pdf','audit_certificate','evidence_manifest','attachment')),
  original_name TEXT,
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER,
  sha256 TEXT NOT NULL,
  encryption_key_ref TEXT,
  retention_until TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  canonical_file_id TEXT NOT NULL REFERENCES document_files(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  require_email_otp INTEGER NOT NULL DEFAULT 1,
  require_sms_otp INTEGER NOT NULL DEFAULT 0,
  require_device_binding INTEGER NOT NULL DEFAULT 1,
  require_kba INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  otp_ttl_seconds INTEGER NOT NULL DEFAULT 600,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS envelopes (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  message TEXT,
  client_id TEXT,
  template_id TEXT REFERENCES document_templates(id),
  source_file_id TEXT NOT NULL REFERENCES document_files(id),
  canonical_file_id TEXT REFERENCES document_files(id),
  final_signed_file_id TEXT REFERENCES document_files(id),
  audit_certificate_file_id TEXT REFERENCES document_files(id),
  evidence_manifest_file_id TEXT REFERENCES document_files(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','in_progress','completed','declined','expired','voided')),
  signing_order_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (signing_order_mode IN ('parallel','sequential')),
  expires_at TEXT,
  sent_at TEXT,
  completed_at TEXT,
  declined_at TEXT,
  voided_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_envelopes_status ON envelopes(status);
CREATE INDEX IF NOT EXISTS idx_envelopes_client ON envelopes(client_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_created ON envelopes(created_at DESC);

CREATE TABLE IF NOT EXISTS envelope_recipients (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'signer' CHECK (role IN ('signer','approver','cc','witness','notary')),
  routing_order INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_e164 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invited','viewed','authenticated','in_progress','completed','declined','expired')),
  auth_policy_id TEXT REFERENCES auth_policies(id),
  invitation_token_hash TEXT,
  invitation_expires_at TEXT,
  first_viewed_at TEXT,
  completed_at TEXT,
  declined_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_envelope_recipients_envelope ON envelope_recipients(envelope_id, routing_order);
CREATE INDEX IF NOT EXISTS idx_envelope_recipients_email ON envelope_recipients(email);

CREATE TABLE IF NOT EXISTS document_fields (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES envelope_recipients(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('signature','initial','date','text','checkbox')),
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  validation_json TEXT,
  value_text TEXT,
  value_file_id TEXT REFERENCES document_files(id),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (x >= 0 AND x <= 1),
  CHECK (y >= 0 AND y <= 1),
  CHECK (width > 0 AND width <= 1),
  CHECK (height > 0 AND height <= 1)
);

CREATE INDEX IF NOT EXISTS idx_document_fields_envelope ON document_fields(envelope_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_fields_recipient ON document_fields(recipient_id);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  recipient_id TEXT REFERENCES envelope_recipients(id) ON DELETE CASCADE,
  user_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  destination_masked TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_recipient_created ON otp_challenges(recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kba_challenges (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES envelope_recipients(id) ON DELETE CASCADE,
  question_set_version TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  passed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_bindings (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','recipient')),
  subject_id TEXT NOT NULL,
  binding_token_hash TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_bindings_subject ON device_bindings(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS envelope_events (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE RESTRICT,
  recipient_id TEXT REFERENCES envelope_recipients(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff','client','signer','system','notary')),
  actor_id TEXT,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  occurred_at_utc TEXT NOT NULL,
  ip_address TEXT,
  geo_city TEXT,
  geo_region TEXT,
  geo_country TEXT,
  geo_lat_approx REAL,
  geo_lon_approx REAL,
  user_agent TEXT,
  browser_family TEXT,
  os_family TEXT,
  device_class TEXT,
  device_fingerprint_hash TEXT,
  session_id TEXT,
  request_id TEXT NOT NULL,
  metadata_json TEXT,
  prev_event_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE,
  server_signature TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_envelope_events_envelope_time ON envelope_events(envelope_id, occurred_at_utc, id);
CREATE INDEX IF NOT EXISTS idx_envelope_events_type ON envelope_events(event_type);

CREATE TABLE IF NOT EXISTS envelope_seals (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL UNIQUE REFERENCES envelopes(id) ON DELETE RESTRICT,
  seal_version INTEGER NOT NULL DEFAULT 1,
  final_pdf_sha256 TEXT NOT NULL,
  audit_pdf_sha256 TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  event_chain_head_hash TEXT NOT NULL,
  signature_algorithm TEXT NOT NULL,
  public_key_id TEXT NOT NULL,
  digital_signature TEXT NOT NULL,
  sealed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_records (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL UNIQUE REFERENCES envelopes(id) ON DELETE RESTRICT,
  public_id TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'valid' CHECK (verification_status IN ('valid','voided','revoked','unknown')),
  document_label TEXT,
  issuer_name TEXT NOT NULL DEFAULT 'Pinnacle Management Ventures',
  completed_date TEXT,
  signer_count INTEGER NOT NULL DEFAULT 0,
  final_pdf_sha256_prefix TEXT,
  sealed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_public_id ON verification_records(public_id);

-- RON extension foundation. These tables are intentionally not exposed as compliance claims.
CREATE TABLE IF NOT EXISTS ron_sessions (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE RESTRICT,
  notary_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled','failed')),
  av_recording_file_id TEXT REFERENCES document_files(id),
  av_recording_sha256 TEXT,
  notary_location_state TEXT,
  principal_location_text TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ron_identity_checks (
  id TEXT PRIMARY KEY,
  ron_session_id TEXT NOT NULL REFERENCES ron_sessions(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES envelope_recipients(id) ON DELETE RESTRICT,
  credential_type TEXT,
  credential_analysis_status TEXT,
  identity_proofing_method TEXT,
  identity_proofing_status TEXT,
  output_reference TEXT,
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ron_journal_entries (
  id TEXT PRIMARY KEY,
  ron_session_id TEXT NOT NULL UNIQUE REFERENCES ron_sessions(id) ON DELETE RESTRICT,
  notarial_act_type TEXT NOT NULL,
  record_description TEXT NOT NULL,
  principal_name TEXT NOT NULL,
  principal_address TEXT,
  identity_evidence_notation TEXT,
  fee_amount REAL,
  journal_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
