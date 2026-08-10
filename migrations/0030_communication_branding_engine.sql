-- Communication + Branding Engine for PMV Document Hub / e-Signature system.
-- Fully self-hosted: templates, versions, assets, rendering assignments and audit state remain internal.

CREATE TABLE IF NOT EXISTS branding_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  organization_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_default INTEGER NOT NULL DEFAULT 0,
  logo_file_id TEXT REFERENCES document_files(id),
  primary_color TEXT NOT NULL DEFAULT '#C8A96B',
  secondary_color TEXT NOT NULL DEFAULT '#0F1720',
  accent_color TEXT,
  background_color TEXT,
  text_color TEXT,
  heading_font_family TEXT,
  body_font_family TEXT,
  font_assets_json TEXT,
  email_header_html TEXT,
  email_footer_html TEXT,
  legal_disclaimer TEXT,
  social_links_json TEXT,
  pdf_header_text TEXT,
  pdf_footer_text TEXT,
  pdf_page_size TEXT NOT NULL DEFAULT 'LETTER',
  pdf_orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (pdf_orientation IN ('portrait','landscape')),
  pdf_margin_top REAL NOT NULL DEFAULT 54,
  pdf_margin_right REAL NOT NULL DEFAULT 54,
  pdf_margin_bottom REAL NOT NULL DEFAULT 54,
  pdf_margin_left REAL NOT NULL DEFAULT 54,
  signature_block_style_json TEXT,
  audit_table_style_json TEXT,
  custom_css TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branding_profiles_status ON branding_profiles(status,is_default,name);

CREATE TABLE IF NOT EXISTS branding_profile_versions (
  id TEXT PRIMARY KEY,
  branding_profile_id TEXT NOT NULL REFERENCES branding_profiles(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_note TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branding_profile_id,version_number)
);

CREATE INDEX IF NOT EXISTS idx_branding_profile_versions_profile ON branding_profile_versions(branding_profile_id,version_number DESC);

CREATE TABLE IF NOT EXISTS communication_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_key TEXT NOT NULL UNIQUE,
  template_type TEXT NOT NULL CHECK (template_type IN ('sign_invitation','sign_reminder','sign_completion','sign_decline','sign_expiration','internal_notification','custom')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  description TEXT,
  branding_profile_id TEXT REFERENCES branding_profiles(id),
  subject_template TEXT NOT NULL,
  preheader_template TEXT,
  body_html TEXT NOT NULL,
  body_text TEXT,
  custom_css TEXT,
  editor_json TEXT,
  variable_schema_json TEXT,
  conditional_rules_json TEXT,
  attach_audit_certificate INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communication_templates_type_status ON communication_templates(template_type,status);

CREATE TABLE IF NOT EXISTS communication_template_versions (
  id TEXT PRIMARY KEY,
  communication_template_id TEXT NOT NULL REFERENCES communication_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  subject_template TEXT NOT NULL,
  preheader_template TEXT,
  body_html TEXT NOT NULL,
  body_text TEXT,
  custom_css TEXT,
  editor_json TEXT,
  variable_schema_json TEXT,
  conditional_rules_json TEXT,
  branding_profile_id TEXT REFERENCES branding_profiles(id),
  attach_audit_certificate INTEGER NOT NULL DEFAULT 0,
  change_note TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(communication_template_id,version_number)
);

CREATE INDEX IF NOT EXISTS idx_communication_template_versions_template ON communication_template_versions(communication_template_id,version_number DESC);

CREATE TABLE IF NOT EXISTS template_assignments (
  id TEXT PRIMARY KEY,
  assignment_scope TEXT NOT NULL CHECK (assignment_scope IN ('global','organization','document_type','envelope')),
  scope_key TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sign_invitation','sign_reminder','sign_completion','sign_decline','sign_expiration','internal_notification')),
  communication_template_id TEXT NOT NULL REFERENCES communication_templates(id),
  branding_profile_id TEXT REFERENCES branding_profiles(id),
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_assignments_lookup ON template_assignments(event_type,assignment_scope,scope_key,enabled,priority);

CREATE TABLE IF NOT EXISTS communication_render_logs (
  id TEXT PRIMARY KEY,
  envelope_id TEXT REFERENCES envelopes(id) ON DELETE SET NULL,
  recipient_id TEXT REFERENCES envelope_recipients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  template_id TEXT REFERENCES communication_templates(id),
  template_version_id TEXT REFERENCES communication_template_versions(id),
  branding_profile_id TEXT REFERENCES branding_profiles(id),
  branding_profile_version_id TEXT REFERENCES branding_profile_versions(id),
  recipient_address TEXT,
  rendered_subject TEXT,
  rendered_html_sha256 TEXT,
  rendered_text_sha256 TEXT,
  attachment_manifest_json TEXT,
  delivery_transport TEXT NOT NULL DEFAULT 'smtp',
  delivery_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'rendered' CHECK (delivery_status IN ('rendered','queued','sent','failed')),
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_communication_render_logs_envelope ON communication_render_logs(envelope_id,created_at DESC);

CREATE TABLE IF NOT EXISTS custom_font_assets (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  font_weight INTEGER NOT NULL DEFAULT 400,
  font_style TEXT NOT NULL DEFAULT 'normal' CHECK (font_style IN ('normal','italic')),
  file_id TEXT NOT NULL REFERENCES document_files(id),
  mime_type TEXT,
  usage_scope TEXT NOT NULL DEFAULT 'both' CHECK (usage_scope IN ('email','pdf','both')),
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_font_assets_family ON custom_font_assets(family_name,font_weight,font_style,active);

CREATE TABLE IF NOT EXISTS template_change_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('communication_template','branding_profile')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','updated','versioned','activated','archived','assigned','test_sent')),
  version_id TEXT,
  actor_user_id TEXT,
  metadata_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_change_events_entity ON template_change_events(entity_type,entity_id,occurred_at DESC);

-- Pin exact rendering choices on each envelope so historical emails/PDFs remain reproducible.
ALTER TABLE envelopes ADD COLUMN branding_profile_id TEXT REFERENCES branding_profiles(id);
ALTER TABLE envelopes ADD COLUMN branding_profile_version_id TEXT REFERENCES branding_profile_versions(id);
ALTER TABLE envelopes ADD COLUMN invitation_template_id TEXT REFERENCES communication_templates(id);
ALTER TABLE envelopes ADD COLUMN completion_template_id TEXT REFERENCES communication_templates(id);
ALTER TABLE envelopes ADD COLUMN document_render_context_json TEXT;
