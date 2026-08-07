-- "Average Resolution Time" (Operations report, see docs/crm-expansion-design.md
-- #4) needs a real resolved timestamp — first_response_at (migration 0016)
-- only covers time-to-first-response. Same pattern: set once, by
-- application code, the first time a ticket's status becomes 'closed'.
ALTER TABLE support_tickets ADD COLUMN resolved_at TEXT;
