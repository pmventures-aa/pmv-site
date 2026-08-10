-- Community Documents: managed shared templates and knowledge documents.
ALTER TABLE internal_documents ADD COLUMN library_scope TEXT NOT NULL DEFAULT 'workspace' CHECK (library_scope IN ('workspace','community'));
ALTER TABLE internal_documents ADD COLUMN is_editable INTEGER NOT NULL DEFAULT 1 CHECK (is_editable IN (0,1));
ALTER TABLE internal_documents ADD COLUMN is_branded INTEGER NOT NULL DEFAULT 1 CHECK (is_branded IN (0,1));
ALTER TABLE internal_documents ADD COLUMN community_category TEXT;
ALTER TABLE internal_documents ADD COLUMN published_at TEXT;

CREATE INDEX IF NOT EXISTS idx_internal_documents_scope_status ON internal_documents(library_scope,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_documents_community_category ON internal_documents(community_category,updated_at DESC);
