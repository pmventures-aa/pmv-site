PRAGMA foreign_keys = ON;

-- Opaque, stable client reference for staff-facing URLs. The internal users.id
-- remains the relational key and never becomes a session credential.
ALTER TABLE users ADD COLUMN public_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_ref
  ON users(public_ref) WHERE public_ref IS NOT NULL;

UPDATE users
SET public_ref = lower(hex(randomblob(16)))
WHERE role = 'client' AND public_ref IS NULL;

-- Cover every current and future client creation path, including seeded review
-- accounts, without requiring each caller to know URL-routing concerns.
CREATE TRIGGER IF NOT EXISTS trg_users_client_public_ref
AFTER INSERT ON users
WHEN NEW.role = 'client' AND NEW.public_ref IS NULL
BEGIN
  UPDATE users SET public_ref = lower(hex(randomblob(16))) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_users_promoted_client_public_ref
AFTER UPDATE OF role ON users
WHEN NEW.role = 'client' AND NEW.public_ref IS NULL
BEGIN
  UPDATE users SET public_ref = lower(hex(randomblob(16))) WHERE id = NEW.id;
END;
