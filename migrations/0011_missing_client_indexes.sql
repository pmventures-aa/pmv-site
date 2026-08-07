-- appointments, support_tickets, funding_applications, and internal_notes
-- were missing the client_user_id index every sibling client-scoped table
-- has (matters, client_tasks, invoices, etc.). scopeFilter() runs a
-- `client_user_id IN (...)` on all four on every portal/admin dashboard
-- load, so without an index that's a full table scan as data grows.
CREATE INDEX idx_appointments_client ON appointments(client_user_id);
CREATE INDEX idx_tickets_client ON support_tickets(client_user_id);
CREATE INDEX idx_funding_client ON funding_applications(client_user_id);
CREATE INDEX idx_notes_client ON internal_notes(client_user_id);
CREATE INDEX idx_notes_matter ON internal_notes(matter_id);
