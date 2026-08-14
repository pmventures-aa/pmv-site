-- Faster HQ field-work lists, maps, and dispatch fee estimates.
-- List queries filter by assigned_by_user_id OR vendor_user_id; the vendor
-- index already exists from 0040. Fee estimates scan recent payouts by
-- service_key + created_at.
CREATE INDEX IF NOT EXISTS idx_field_assignments_assigned_by
  ON field_assignments(assigned_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_field_assignments_status_updated
  ON field_assignments(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_assignments_fee_market
  ON field_assignments(service_key, created_at DESC);
