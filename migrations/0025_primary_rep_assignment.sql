PRAGMA foreign_keys = ON;

-- Staff assignments already control client visibility. A primary flag lets
-- notification routing identify the single representative responsible for a
-- submitted application without changing the existing team-access model.
ALTER TABLE staff_assignments ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_assign_one_primary_per_client
  ON staff_assignments(client_user_id)
  WHERE is_primary = 1;
