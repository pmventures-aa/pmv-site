-- Regressed to a no-op. Superseded by 0098_consultation_booking_rebuild.sql.
--
-- This migration originally created the consultation_bookings table.
--
-- The four-step consultation set (0094 through 0097) was state-dependent:
-- 0097 ended in a bare ALTER TABLE ADD COLUMN, and SQLite has no
-- ADD COLUMN IF NOT EXISTS. Applying the schema by hand in the D1 console --
-- the only route available without wrangler credentials -- therefore left a
-- landmine, because the next `wrangler d1 migrations apply` would reach 0097,
-- abort on a duplicate column, and stop the run partway through.
--
-- 0098 restates all four steps in their final shape using only statements that
-- no-op when the object already exists. These files are kept, rather than
-- deleted, so the migration numbering stays stable and any database that has
-- already recorded them as applied stays consistent.

SELECT 'superseded by 0098_consultation_booking_rebuild' AS note;
