-- HQ-editable outbound email templates. System rows are seeded at runtime from
-- the catalog; staff can customize them anytime and add custom templates.

CREATE TABLE hq_email_templates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  wrap_letterhead INTEGER NOT NULL DEFAULT 1,
  include_signature INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  preheader TEXT,
  eyebrow TEXT,
  title TEXT,
  body_html TEXT NOT NULL,
  cta_label TEXT,
  cta_url_token TEXT,
  security_note TEXT,
  variable_schema_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_hq_email_templates_category ON hq_email_templates(category, sort_order, name);

CREATE TABLE hq_email_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES hq_email_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_note TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(template_id, version_number)
);

CREATE INDEX idx_hq_email_template_versions_template ON hq_email_template_versions(template_id, version_number DESC);
