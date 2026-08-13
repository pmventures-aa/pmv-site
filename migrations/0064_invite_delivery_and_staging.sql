-- Track invitation email delivery (Resend provider id + webhook status)
-- and attach a staged vendor/staff profile as soon as HQ sends an invite.
ALTER TABLE access_invites ADD COLUMN email_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE access_invites ADD COLUMN email_provider_id TEXT;
ALTER TABLE access_invites ADD COLUMN email_error TEXT;
ALTER TABLE access_invites ADD COLUMN email_sent_at TEXT;
ALTER TABLE access_invites ADD COLUMN email_delivered_at TEXT;
ALTER TABLE access_invites ADD COLUMN staged_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_access_invites_provider ON access_invites(email_provider_id);
CREATE INDEX IF NOT EXISTS idx_access_invites_staged ON access_invites(staged_user_id);
