-- Add Terms of Service acceptance tracking to users.
-- Required at signup going forward; existing rows (if any) are left NULL.
ALTER TABLE users ADD COLUMN tos_accepted_at TEXT;
