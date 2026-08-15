PRAGMA foreign_keys = ON;

-- One intake can produce more than one operational record while retaining a
-- durable source link. Target ids are polymorphic and are checked by the API.
CREATE TABLE IF NOT EXISTS support_ticket_conversions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('matter','task','field_assignment','quote')),
  target_id TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ticket_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_conversions_ticket
  ON support_ticket_conversions(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_conversions_target
  ON support_ticket_conversions(target_type, target_id);

-- Existing assignment GPS remains the last-known source. Network map sharing
-- uses the same one-row-per-user store without collecting a breadcrumb trail.
ALTER TABLE field_agent_locations ADD COLUMN source TEXT NOT NULL DEFAULT 'assignment';
ALTER TABLE field_agent_locations ADD COLUMN sharing_active INTEGER NOT NULL DEFAULT 0;
