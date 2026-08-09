CREATE TABLE IF NOT EXISTS vendor_application_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vendor_application_documents_user ON vendor_application_documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_application_documents_type ON vendor_application_documents(document_type);
