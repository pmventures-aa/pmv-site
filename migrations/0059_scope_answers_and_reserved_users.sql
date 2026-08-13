PRAGMA foreign_keys = ON;

-- Persist the custom questionnaire answers from an entry-aware scope form,
-- and keep a reserved client user linked as a lead until they engage.
ALTER TABLE public_scope_requests ADD COLUMN answers_json TEXT;
ALTER TABLE public_scope_requests ADD COLUMN reserved_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_public_scope_reserved_user ON public_scope_requests(reserved_user_id);
