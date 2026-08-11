-- Personalized client command center and measurable request SLAs.
ALTER TABLE support_tickets ADD COLUMN service_key TEXT REFERENCES services(key) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN property_id TEXT REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN details TEXT;
ALTER TABLE support_tickets ADD COLUMN response_due_at TEXT;
ALTER TABLE support_tickets ADD COLUMN resolution_due_at TEXT;
ALTER TABLE support_tickets ADD COLUMN waiting_on TEXT NOT NULL DEFAULT 'pinnacle' CHECK (waiting_on IN ('pinnacle','client','vendor'));
ALTER TABLE support_tickets ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_support_tickets_client_status_due
  ON support_tickets(client_user_id,status,response_due_at,resolution_due_at);
