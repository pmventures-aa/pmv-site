-- Field-work list and dispatch-fee lookups used on vendor mobile + HQ dispatch.
CREATE INDEX IF NOT EXISTS idx_field_assignments_assigned_by
  ON field_assignments(assigned_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_field_assignments_fee_market
  ON field_assignments(service_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_agent_locations_active
  ON field_agent_locations(sharing_active, updated_at);
