-- Provider display name.
--
-- The name a provider goes by in the network, distinct from the full legal
-- name captured for agreements/verification. Providers set their own (legal
-- names can be long, formal, or arrive malformed from SSO), and HQ can edit
-- it. Lives on team_members so it can serve any team member later.

ALTER TABLE team_members ADD COLUMN display_name TEXT;
