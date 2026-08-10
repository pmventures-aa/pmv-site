-- Field-work assignments for Property Management and mobile Notary vendors,
-- plus a "ron" kind for Remote Online Notarization sessions. One table for
-- both because the audit trail, documents-and-signers block, and signature
-- capture are identical — only the travel-related columns are used for
-- kind='field' and stay null for kind='ron'.
--
-- Design notes:
--   * status is a plain TEXT rather than an enum table so app code can
--     evolve the workflow without a schema change. Values today:
--       assigned | traveling | on_site | documented | signed | completed | cancelled
--   * lat/lng stored as REAL and are always paired with the timestamp taken
--     at the same moment; we deliberately do NOT keep a full breadcrumb
--     track — three checkpoints (depart / arrive / complete) is the whole
--     tracking design per PR discussion.
--   * signature_type + signature_image_key let the vendor choose between
--     typed name and a drawn signature (PNG stored in R2 alongside other
--     uploads) per-job.
CREATE TABLE field_assignments (
  id                     TEXT PRIMARY KEY,
  kind                   TEXT NOT NULL DEFAULT 'field', -- 'field' | 'ron'
  service_key            TEXT NOT NULL,                 -- 'property_management' | 'mobile_notary' | 'ron' | ...
  client_user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_user_id         TEXT NOT NULL REFERENCES users(id),
  assigned_by_user_id    TEXT REFERENCES users(id),
  title                  TEXT,                          -- short label shown to the vendor, e.g. "Estate signing — Boca"
  site_label             TEXT,                          -- "Client home", "3rd-floor conference room", etc.
  site_address           TEXT,                          -- street address for the pin
  site_city              TEXT,
  site_state             TEXT,
  site_postal_code       TEXT,
  site_lat               REAL,
  site_lng               REAL,
  scheduled_at           TEXT,                          -- ISO — when the vendor is expected on-site
  status                 TEXT NOT NULL DEFAULT 'assigned',

  -- Travel checkpoints (field only; RON leaves these NULL)
  departed_at            TEXT,
  depart_lat             REAL,
  depart_lng             REAL,
  arrived_at             TEXT,
  arrival_lat            REAL,
  arrival_lng            REAL,
  arrival_source         TEXT,                          -- 'auto_geofence' | 'manual'

  -- Completion + signature
  documented_at          TEXT,
  completed_at           TEXT,
  completion_lat         REAL,
  completion_lng         REAL,
  vendor_signature_type  TEXT,                          -- 'typed' | 'drawn'
  vendor_signature_name  TEXT,
  vendor_signature_image_key TEXT,                      -- R2 object key for drawn PNG
  vendor_signed_at       TEXT,
  vendor_signed_ip       TEXT,
  audit_email_sent_at    TEXT,

  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_field_assignments_vendor ON field_assignments(vendor_user_id, status);
CREATE INDEX idx_field_assignments_client ON field_assignments(client_user_id);
CREATE INDEX idx_field_assignments_created ON field_assignments(created_at);
CREATE INDEX idx_field_assignments_kind_status ON field_assignments(kind, status);

-- One row per document handled during the visit / session. document_type is
-- free text so vendors can enter "Warranty deed", "Grant deed", "Bill of
-- lading", etc. without waiting for a code table update. signer_names is
-- stored as a JSON array; a small dependency at read time keeps schema
-- simple.
CREATE TABLE field_assignment_documents (
  id                 TEXT PRIMARY KEY,
  assignment_id      TEXT NOT NULL REFERENCES field_assignments(id) ON DELETE CASCADE,
  document_type      TEXT NOT NULL,
  signer_names       TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  witness_role       INTEGER NOT NULL DEFAULT 0,  -- 0 = no, 1 = vendor served as witness
  oath_administered  INTEGER NOT NULL DEFAULT 0,  -- 0 = no, 1 = yes
  stamps_count       INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_field_assignment_documents_asn ON field_assignment_documents(assignment_id);
