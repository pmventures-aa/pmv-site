-- Cleaning property profiles: a client's property details stored once so they
-- are not re-entered on every booking and so an assigned cleaner has the
-- instructions they need on site. Sensitive access details (codes, lockbox,
-- gate) are kept in their own column and only returned to the owner, staff, or
-- the vendor assigned to an active job at that property.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cleaning_property_profiles (
  id                    TEXT PRIMARY KEY,
  client_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  nickname              TEXT,
  property_type         TEXT,                       -- house | condo | townhome | apartment | str | other
  address               TEXT,
  unit                  TEXT,
  county                TEXT,                       -- miami_dade | broward | palm_beach
  bedrooms              INTEGER,
  bathrooms             INTEGER,
  beds                  INTEGER,
  square_feet           INTEGER,

  -- Non-sensitive operating instructions the cleaner needs.
  parking               TEXT,
  building_entry        TEXT,
  trash_location        TEXT,
  supply_location       TEXT,
  laundry_notes         TEXT,
  linen_standards       TEXT,
  cleaning_preferences  TEXT,
  do_not_touch          TEXT,
  pet_notes             TEXT,
  special_warnings      TEXT,
  checkin_time          TEXT,
  checkout_time         TEXT,
  emergency_contact     TEXT,

  -- Sensitive access details; access-gated on read.
  access_instructions   TEXT,

  -- Defaults applied when booking against this property.
  default_service_type  TEXT,
  default_addons_json   TEXT NOT NULL DEFAULT '{}',

  active                INTEGER NOT NULL DEFAULT 1,
  created_by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_property_client ON cleaning_property_profiles(client_user_id, active);

-- Link a cleaning job to the property profile it was booked against.
ALTER TABLE cleaning_jobs ADD COLUMN property_profile_id TEXT REFERENCES cleaning_property_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_property_profile ON cleaning_jobs(property_profile_id);
