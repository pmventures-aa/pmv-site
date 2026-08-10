-- General-purpose internal Document Hub workspace.
-- Separate from envelope/signing tables: ordinary staff documents can exist,
-- be edited/versioned/shared, and only become envelopes when explicitly sent
-- for signature.

CREATE TABLE IF NOT EXISTS internal_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  folder TEXT NOT NULL DEFAULT 'General',
  document_type TEXT NOT NULL DEFAULT 'file' CHECK (document_type IN ('file','text')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  current_file_id TEXT REFERENCES document_files(id),
  text_content TEXT,
  mime_type TEXT,
  original_name TEXT,
  tags_json TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_internal_documents_status_updated ON internal_documents(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_documents_folder ON internal_documents(folder, updated_at DESC);

CREATE TABLE IF NOT EXISTS internal_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES internal_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_id TEXT REFERENCES document_files(id),
  text_content TEXT,
  change_note TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_internal_document_versions_document ON internal_document_versions(document_id, version_number DESC);

CREATE TABLE IF NOT EXISTS internal_document_shares (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES internal_documents(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES internal_document_versions(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  message TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  opened_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internal_document_shares_document ON internal_document_shares(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_document_shares_token ON internal_document_shares(token_hash);
