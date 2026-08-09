PRAGMA foreign_keys = ON;

-- Upgrade the existing inquiry row into the durable pre-client CRM record.
-- Keeping the same table preserves public form ingestion and the existing
-- atomic lead -> client conversion/history transfer.
ALTER TABLE contact_inquiries ADD COLUMN record_type TEXT NOT NULL DEFAULT 'person'; -- person | business
ALTER TABLE contact_inquiries ADD COLUMN first_name TEXT;
ALTER TABLE contact_inquiries ADD COLUMN last_name TEXT;
ALTER TABLE contact_inquiries ADD COLUMN company_name TEXT;
ALTER TABLE contact_inquiries ADD COLUMN job_title TEXT;
ALTER TABLE contact_inquiries ADD COLUMN website TEXT;
ALTER TABLE contact_inquiries ADD COLUMN industry TEXT;
ALTER TABLE contact_inquiries ADD COLUMN source TEXT;
ALTER TABLE contact_inquiries ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'lead'; -- lead | prospect | opportunity | converted | lost
ALTER TABLE contact_inquiries ADD COLUMN owner_staff_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE contact_inquiries ADD COLUMN address_line1 TEXT;
ALTER TABLE contact_inquiries ADD COLUMN address_line2 TEXT;
ALTER TABLE contact_inquiries ADD COLUMN city TEXT;
ALTER TABLE contact_inquiries ADD COLUMN state TEXT;
ALTER TABLE contact_inquiries ADD COLUMN postal_code TEXT;
ALTER TABLE contact_inquiries ADD COLUMN country TEXT;
ALTER TABLE contact_inquiries ADD COLUMN email_status TEXT NOT NULL DEFAULT 'emailable'; -- emailable | unsubscribed | bounced | suppressed
ALTER TABLE contact_inquiries ADD COLUMN email_unsubscribed_at TEXT;
ALTER TABLE contact_inquiries ADD COLUMN last_contacted_at TEXT;
ALTER TABLE contact_inquiries ADD COLUMN custom_fields_json TEXT;
ALTER TABLE contact_inquiries ADD COLUMN updated_at TEXT;

UPDATE contact_inquiries
SET lifecycle_stage = CASE WHEN status = 'lost' THEN 'lost' WHEN client_user_id IS NOT NULL THEN 'converted' ELSE 'lead' END,
    updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX idx_inquiries_record_type ON contact_inquiries(record_type);
CREATE INDEX idx_inquiries_lifecycle ON contact_inquiries(lifecycle_stage, status);
CREATE INDEX idx_inquiries_owner ON contact_inquiries(owner_staff_user_id);
CREATE INDEX idx_inquiries_company ON contact_inquiries(company_name);
CREATE INDEX idx_inquiries_email_status ON contact_inquiries(email_status);

-- Clients can also be targeted from Communications. Marketing suppression is
-- separate from account status because an active portal user can opt out of
-- marketing while still receiving operational/account messages.
ALTER TABLE users ADD COLUMN marketing_email_status TEXT NOT NULL DEFAULT 'emailable'; -- emailable | unsubscribed | bounced | suppressed
ALTER TABLE users ADD COLUMN marketing_unsubscribed_at TEXT;

-- Static lists hold explicit members. Dynamic lists/segments store filters in
-- filter_json and are resolved at send/view time so membership stays current.
CREATE TABLE crm_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  list_type TEXT NOT NULL DEFAULT 'static', -- static | dynamic
  record_type TEXT NOT NULL DEFAULT 'all',  -- all | person | business
  filter_json TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crm_lists_type ON crm_lists(list_type, archived_at);

CREATE TABLE crm_list_members (
  list_id TEXT NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
  inquiry_id TEXT NOT NULL REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (list_id, inquiry_id)
);
CREATE INDEX idx_crm_list_members_inquiry ON crm_list_members(inquiry_id);

CREATE TABLE crm_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE crm_record_tags (
  inquiry_id TEXT NOT NULL REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (inquiry_id, tag_id)
);
CREATE INDEX idx_crm_record_tags_tag ON crm_record_tags(tag_id);

-- Import history makes CSV uploads auditable and lets HQ show what happened
-- without retaining the raw uploaded CSV indefinitely.
CREATE TABLE crm_imports (
  id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  file_name TEXT,
  record_type TEXT NOT NULL DEFAULT 'person',
  status TEXT NOT NULL DEFAULT 'completed', -- processing | completed | failed
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  mapping_json TEXT,
  errors_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crm_imports_created_at ON crm_imports(created_at);

-- Communications can now resolve recipients that do not yet have PMV user
-- accounts. Existing user_id remains nullable for exactly this reason.
ALTER TABLE comms_recipients ADD COLUMN inquiry_id TEXT REFERENCES contact_inquiries(id) ON DELETE SET NULL;
ALTER TABLE comms_recipients ADD COLUMN recipient_kind TEXT NOT NULL DEFAULT 'user'; -- user | lead
CREATE INDEX idx_comms_recipients_inquiry ON comms_recipients(inquiry_id);

-- Marketing vs. operational/internal messages use different suppression rules.
ALTER TABLE comms_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'marketing'; -- marketing | operational | internal
