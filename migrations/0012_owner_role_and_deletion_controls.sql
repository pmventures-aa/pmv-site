-- Owner tier + permanent-deletion controls (see docs/crm-expansion-design.md #2).
--
-- Owner is modeled as a flag on team_members rather than a 4th `users.role`
-- value: every existing authorization check in the codebase branches on
-- role IN ('client','staff','admin'), so adding a new role value would mean
-- auditing every one of those checks. An is_owner flag on top of the
-- existing admin role is a strict superset — an Owner is always role='admin'
-- AND is_owner=1 — so nothing that already checks requireAdmin/role==='admin'
-- needs to change; only the new permanent-delete endpoint checks the flag.
ALTER TABLE team_members ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;

-- Soft-delete (archive) columns on every entity the spec calls out as
-- user-deletable. Archiving is reversible and available to any staff/admin
-- with the right capability; only an Owner can go from archived -> gone
-- (see permanent_deletions below). Nullable ADD COLUMNs only — no table
-- rebuilds, safe to run against a live database with existing rows.
ALTER TABLE contact_inquiries ADD COLUMN archived_at TEXT;
ALTER TABLE contact_inquiries ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE contact_inquiries ADD COLUMN archived_reason TEXT;

ALTER TABLE matters ADD COLUMN archived_at TEXT;
ALTER TABLE matters ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE matters ADD COLUMN archived_reason TEXT;

ALTER TABLE client_tasks ADD COLUMN archived_at TEXT;
ALTER TABLE client_tasks ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE client_tasks ADD COLUMN archived_reason TEXT;

ALTER TABLE invoices ADD COLUMN archived_at TEXT;
ALTER TABLE invoices ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN archived_reason TEXT;

ALTER TABLE client_documents ADD COLUMN archived_at TEXT;
ALTER TABLE client_documents ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE client_documents ADD COLUMN archived_reason TEXT;

ALTER TABLE support_tickets ADD COLUMN archived_at TEXT;
ALTER TABLE support_tickets ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE support_tickets ADD COLUMN archived_reason TEXT;

ALTER TABLE internal_notes ADD COLUMN archived_at TEXT;
ALTER TABLE internal_notes ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE internal_notes ADD COLUMN archived_reason TEXT;

-- Client accounts (users) are archivable via the existing status='suspended'
-- state, not a new column — a suspended client is already excluded from
-- active-client views. Owner-only permanent deletion of a user is still
-- covered generically by permanent_deletions below (entity_type='users').

-- Permanent, append-only ledger of every hard delete. entity_type/entity_id
-- (not a per-table FK) because by the time this row is written, the
-- original row is already gone — there is nothing left to point a foreign
-- key at. snapshot_json holds a full copy of the deleted row so "deleted
-- records must be logged permanently" is actually satisfiable after the
-- fact. The API layer must never expose an UPDATE/DELETE route for this
-- table — D1 itself has no row-level permission model to enforce that.
CREATE TABLE permanent_deletions (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,             -- e.g. 'contact_inquiries', 'matters', 'users'
  entity_id       TEXT NOT NULL,
  snapshot_json   TEXT NOT NULL,             -- full row, as it existed immediately before deletion
  deleted_by      TEXT NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  actor_ip        TEXT,
  deleted_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_permdel_entity ON permanent_deletions(entity_type, entity_id);
CREATE INDEX idx_permdel_deleted_by ON permanent_deletions(deleted_by);
