-- Two more delegable capabilities, same pattern as the three added in 0008
-- (can_reveal_payment_info / can_manage_users / can_manage_settings): off
-- by default, grantable per staff member without promoting them to admin.
ALTER TABLE team_members ADD COLUMN can_view_reports INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_members ADD COLUMN can_view_audit_log INTEGER NOT NULL DEFAULT 0;
