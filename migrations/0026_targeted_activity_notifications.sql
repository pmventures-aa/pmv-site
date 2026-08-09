PRAGMA foreign_keys = ON;

-- Existing activity_events remain the in-app notification/feed system. An
-- optional recipient lets an event target one assigned representative while
-- preserving the current firm-wide/client-scoped behavior for all other events.
ALTER TABLE activity_events ADD COLUMN recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_activity_recipient ON activity_events(recipient_user_id, created_at);
