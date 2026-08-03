-- Expand the inquiry status vocabulary from new/contacted/closed to a real
-- lead pipeline: new -> contacted -> qualified -> converted (or lost at any
-- point). No CHECK constraint change needed (status was always free-text
-- TEXT); this just documents/enables the wider set the app now validates.

-- Capability flags for staff beyond the coarse staff/admin role split.
-- team_members.staff_role already carries a descriptive specialty; these
-- are enforceable grants an admin can turn on for a specific staff member.
ALTER TABLE team_members ADD COLUMN can_reveal_payment_info INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_members ADD COLUMN can_manage_users INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_members ADD COLUMN can_manage_settings INTEGER NOT NULL DEFAULT 0;

-- Per-staff notification muting: which activity_events "kind" values a
-- staff member does not want surfacing in their bell/feed. Muted kinds are
-- still logged (audit trail intact) — this only affects what's counted
-- unread and shown by default.
CREATE TABLE notification_prefs (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  muted_kinds TEXT NOT NULL DEFAULT '[]',      -- JSON array of activity_events.kind values
  email_enabled INTEGER NOT NULL DEFAULT 0,     -- opt-in; email delivery is a firm-level capability too
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
