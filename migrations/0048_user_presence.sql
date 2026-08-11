-- Presence heartbeat for staff/vendors + clients. Every authenticated API
-- request bumps users.last_seen_at (throttled to at-most once per minute
-- server-side, see functions/_lib/session.ts). The presence endpoints
-- derive the green/yellow/red status by comparing last_seen_at to NOW at
-- read time - no separate presence table, no scheduled job to age rows
-- out. Column is nullable so accounts that predate the migration or
-- have never signed in show as "unknown" (rendered as slate/no dot).
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
