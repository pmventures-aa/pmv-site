-- Client property profiles and matter pages.
-- Cards are never stored here. See shared/cardBrandCompliance.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE properties ADD COLUMN name TEXT;
ALTER TABLE properties ADD COLUMN unit TEXT;
ALTER TABLE properties ADD COLUMN city TEXT;
ALTER TABLE properties ADD COLUMN state TEXT;
ALTER TABLE properties ADD COLUMN postal_code TEXT;
ALTER TABLE properties ADD COLUMN occupancy TEXT;
ALTER TABLE properties ADD COLUMN access_notes TEXT;
ALTER TABLE properties ADD COLUMN bedrooms INTEGER;
ALTER TABLE properties ADD COLUMN bathrooms TEXT;
ALTER TABLE properties ADD COLUMN sqft INTEGER;
ALTER TABLE properties ADD COLUMN year_built INTEGER;
ALTER TABLE properties ADD COLUMN updated_at TEXT;

ALTER TABLE matters ADD COLUMN summary TEXT;
ALTER TABLE matters ADD COLUMN property_id TEXT REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE matters ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_matters_property ON matters(property_id);

ALTER TABLE client_documents ADD COLUMN property_id TEXT REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE client_documents ADD COLUMN matter_id TEXT REFERENCES matters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_docs_property ON client_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_docs_matter ON client_documents(matter_id);

CREATE TABLE matter_updates (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_matter_updates_matter ON matter_updates(matter_id, created_at);
