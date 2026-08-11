-- Provider-network CRM and dispatch readiness. Team members remain the shared
-- access-control identity, while these fields describe the business relationship.
ALTER TABLE team_members ADD COLUMN network_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE team_members ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE team_members ADD COLUMN is_preferred_provider INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_members ADD COLUMN service_area_summary TEXT;

CREATE TABLE provider_network_notes (
  id TEXT PRIMARY KEY,
  provider_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_provider_notes_provider ON provider_network_notes(provider_user_id, created_at DESC);
