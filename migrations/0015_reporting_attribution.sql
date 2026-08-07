-- Executive Reporting Dashboard (see docs/crm-expansion-design.md #5).
--
-- "Revenue by Service" and "Revenue by Employee" are asked for as reports,
-- but nothing today attributes an invoice to either — add both as nullable
-- FKs (existing invoice rows just report as "unattributed" until backfilled
-- or until new invoices are created through an updated form).
ALTER TABLE invoices ADD COLUMN service_key TEXT REFERENCES services(key);
ALTER TABLE invoices ADD COLUMN assigned_staff_user_id TEXT REFERENCES users(id);

-- A saved report definition: which report, what filters, optionally on a
-- schedule. schedule_cron is a standard 5-field cron string evaluated by a
-- Cloudflare Cron Trigger hitting a Worker endpoint (see design doc's
-- scalability section) — NULL means "saved for on-demand run only."
CREATE TABLE report_templates (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  report_key     TEXT NOT NULL,     -- e.g. 'revenue_by_month', 'employee_activity_rankings'
  filters_json   TEXT NOT NULL DEFAULT '{}',
  schedule_cron  TEXT,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_report_templates_created_by ON report_templates(created_by);

-- Execution history for scheduled runs — lets the Reporting Center show
-- "last run: succeeded 2h ago" / "failed: <error>" instead of scheduled
-- reports silently going stale with no visibility.
CREATE TABLE scheduled_report_runs (
  id           TEXT PRIMARY KEY,
  template_id  TEXT NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | succeeded | failed
  export_r2_key TEXT,                            -- where the generated CSV/XLSX landed, if it succeeded
  error        TEXT,
  run_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_report_runs_template ON scheduled_report_runs(template_id);
