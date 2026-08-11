-- Presence heartbeat for staff/vendors + clients. Every authenticated API
-- request bumps users.last_seen_at (throttled to at-most once per minute
-- server-side, see functions/_lib/session.ts). The presence endpoints
-- derive the green/yellow/red status by comparing last_seen_at to NOW at
-- read time - no separate presence table, no scheduled job to age rows
-- out. users.last_seen_at was introduced by 0016_employee_metrics.sql.
-- Re-adding it here stopped the migration chain on clean and production
-- databases. This migration owns only the presence lookup index.
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
