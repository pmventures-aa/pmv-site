-- Profile pictures: R2 object key (not the raw file — see functions/_lib/routes/uploads.ts).
-- NULL means "no avatar uploaded, show initials".
ALTER TABLE users ADD COLUMN avatar_key TEXT;

-- internal_notes already existed in 0001_init.sql (client_user_id + optional
-- matter_id + author_user_id + body) but was never wired to any route or UI
-- — no schema change needed here, it already supports both a client's
-- general profile notes (matter_id NULL) and matter-specific case notes
-- (matter_id set). See functions/_lib/routes/admin.ts for the new endpoints.
