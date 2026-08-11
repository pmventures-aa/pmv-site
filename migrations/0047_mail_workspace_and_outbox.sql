-- Dedicated mail workspace enhancements. Adds JSON-config columns to the
-- existing branding_profiles table (from migration 0030) so the Brand
-- Studio can persist email + PDF fine-tuning without invalidating the
-- existing branding rows, and introduces the self-hosted mail outbox +
-- workspace settings so a future Pinnacle-hosted relay has a landing
-- surface. NOTE: this migration does NOT change how transactional email
-- is delivered today - Resend continues to be the delivery path until
-- the relay is stood up. The outbox is empty until we wire it in.

ALTER TABLE branding_profiles ADD COLUMN email_settings_json TEXT;
ALTER TABLE branding_profiles ADD COLUMN pdf_settings_json TEXT;

CREATE TABLE IF NOT EXISTS self_hosted_mail_outbox (
  id                 TEXT PRIMARY KEY,
  recipient_address  TEXT NOT NULL,
  subject            TEXT NOT NULL,
  html_body          TEXT NOT NULL,
  text_body          TEXT,
  reply_to           TEXT,
  from_address       TEXT NOT NULL,
  headers_json       TEXT,
  tags_json          TEXT,
  attachments_json   TEXT,
  idempotency_key    TEXT,
  status             TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed')),
  attempt_count      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error         TEXT,
  relay_message_id   TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at            TEXT,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_hosted_mail_outbox_idempotency ON self_hosted_mail_outbox(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_self_hosted_mail_outbox_queue ON self_hosted_mail_outbox(status,next_attempt_at,created_at);

CREATE TABLE IF NOT EXISTS mail_workspace_settings (
  key                 TEXT PRIMARY KEY,
  value               TEXT NOT NULL,
  updated_by_user_id  TEXT,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
