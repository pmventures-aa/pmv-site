-- Drop the OTP-login schema from 0001_init.sql. Auth was implemented as
-- email+password with opaque KV-backed sessions (see functions/_lib/routes/auth.ts,
-- functions/_lib/session.ts) — these tables were never written to or read from.
DROP INDEX IF EXISTS idx_otp_user;
DROP TABLE IF EXISTS otp_codes;

DROP INDEX IF EXISTS idx_sessions_user;
DROP TABLE IF EXISTS sessions;
