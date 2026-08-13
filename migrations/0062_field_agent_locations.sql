-- Live GPS pings from field agents / vendors while an assignment is in progress.
CREATE TABLE IF NOT EXISTS field_agent_locations (
  user_id TEXT PRIMARY KEY,
  assignment_id TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy_m REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES field_assignments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_field_agent_locations_updated ON field_agent_locations(updated_at);
