PRAGMA foreign_keys = ON;

-- Staff/vendor initiated service requests continue through the same durable
-- service_application record the client uses. These fields record who opened
-- the work and the client's explicit acceptance before submission.
ALTER TABLE service_applications ADD COLUMN assigned_by_user_id TEXT REFERENCES users(id);
ALTER TABLE service_applications ADD COLUMN assigned_at TEXT;
ALTER TABLE service_applications ADD COLUMN client_signature_name TEXT;
ALTER TABLE service_applications ADD COLUMN client_signature_intent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_applications ADD COLUMN client_signed_at TEXT;
ALTER TABLE service_applications ADD COLUMN client_signature_ip TEXT;
ALTER TABLE service_applications ADD COLUMN client_signature_user_agent TEXT;

CREATE INDEX idx_service_applications_assigned_by ON service_applications(assigned_by_user_id);
CREATE INDEX idx_service_applications_client_status ON service_applications(client_user_id, status);
