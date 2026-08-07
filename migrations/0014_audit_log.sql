-- Audit Log Center (see docs/crm-expansion-design.md #4).
--
-- Deliberately a separate table from activity_events, not an extension of
-- it: activity_events is tuned for the staff notification feed/bell (has
-- per-user mute prefs, is expected to be summarized/paginated for display),
-- while an audit log has different requirements — every login/logout, every
-- permission change, before/after values, and an explicit guarantee that
-- rows are never edited or pruned by app code. Overloading one table for
-- both would mean the feed's "mark seen"/mute affordances sit next to rows
-- that must never be touched. Call sites that already log an activity_event
-- for a given action (status changes, client conversion, etc.) add a
-- parallel audit_log insert; write both in a single D1 batch so they can
-- never drift apart.
CREATE TABLE audit_log (
  id             TEXT PRIMARY KEY,
  actor_user_id  TEXT REFERENCES users(id),
  actor_ip       TEXT,
  action         TEXT NOT NULL,   -- login | logout | record_created | record_updated | record_archived
                                   -- | record_deleted | record_permanently_deleted | email_sent
                                   -- | status_changed | permission_changed | task_assigned
                                   -- | file_uploaded | client_converted
  entity_type    TEXT,            -- table name the action applies to, nullable for login/logout
  entity_id      TEXT,
  before_json    TEXT,            -- prior field values, for *_updated/*_deleted actions
  after_json     TEXT,            -- new field values, for *_created/*_updated actions
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);
