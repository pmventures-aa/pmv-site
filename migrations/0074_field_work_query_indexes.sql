-- Field-work list, map, and local-fee estimate queries filter by assigned_by,
-- status/updated_at, and service_key + created_at / postal prefix. The original
-- 0040 indexes cover vendor+status and kind+status only.
CREATE INDEX IF NOT EXISTS idx_field_assignments_assigned_by
  ON field_assignments(assigned_by_user_id);

CREATE INDEX IF NOT EXISTS idx_field_assignments_status_updated
  ON field_assignments(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_field_assignments_service_created
  ON field_assignments(service_key, created_at);

CREATE INDEX IF NOT EXISTS idx_field_assignments_service_postal
  ON field_assignments(service_key, site_postal_code);

CREATE INDEX IF NOT EXISTS idx_field_agent_locations_sharing
  ON field_agent_locations(sharing_active, updated_at);
