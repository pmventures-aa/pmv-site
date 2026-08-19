-- Human-friendly Provider ID.
--
-- A stable, readable identifier (PMV-1000xx) assigned to each provider,
-- distinct from the internal user UUID, so staff and the application document
-- can reference a provider by a short code. Assigned once and never reused;
-- the running counter lives in app_settings under 'provider_code_seq'.

ALTER TABLE team_members ADD COLUMN provider_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_provider_code
  ON team_members(provider_code) WHERE provider_code IS NOT NULL;
