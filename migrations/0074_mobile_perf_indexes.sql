-- Faster vendor mobile assignment lists, field-map scans, and local fee estimates.
CREATE INDEX IF NOT EXISTS idx_field_assignments_vendor_scheduled
  ON field_assignments(vendor_user_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_field_assignments_assigned_by
  ON field_assignments(assigned_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_field_assignments_status_updated
  ON field_assignments(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_field_assignments_fee_lookup
  ON field_assignments(service_key, status, site_postal_code, created_at);

CREATE INDEX IF NOT EXISTS idx_email_messages_thread_created
  ON email_messages(email_thread_id, created_at DESC);
