-- Employee Management Center (see docs/crm-expansion-design.md #6).
--
-- last_seen_at is a cheap column touched (throttled, not on every request)
-- from requireUser middleware — far cheaper at read time than deriving
-- "last activity" from a MAX(created_at) scan over audit_log per employee
-- on every dashboard load.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- Tasks/matters/tickets have no notion of "which staff member owns this"
-- today — client_user_id identifies the client, not the assignee. Add it
-- as a nullable FK so "Tasks Assigned/Completed/Overdue per employee" and
-- "Department Performance" are direct queries instead of inferred from
-- activity_events.
ALTER TABLE client_tasks ADD COLUMN assigned_staff_user_id TEXT REFERENCES users(id);
ALTER TABLE matters ADD COLUMN assigned_staff_user_id TEXT REFERENCES users(id);
ALTER TABLE support_tickets ADD COLUMN assigned_staff_user_id TEXT REFERENCES users(id);

-- Set once, by application code, the first time a staff member replies to
-- a ticket after it's opened — the basis for "Average Response Time".
ALTER TABLE support_tickets ADD COLUMN first_response_at TEXT;

CREATE INDEX idx_tasks_assigned ON client_tasks(assigned_staff_user_id);
CREATE INDEX idx_matters_assigned ON matters(assigned_staff_user_id);
CREATE INDEX idx_tickets_assigned ON support_tickets(assigned_staff_user_id);
