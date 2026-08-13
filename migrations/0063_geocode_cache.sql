-- Cached public geocoder results so HQ and intake can pin a site without
-- repeating OpenStreetMap / Census lookups on every keystroke.
CREATE TABLE IF NOT EXISTS geocode_cache (
  query_key TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  results_json TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_fetched ON geocode_cache(fetched_at);
