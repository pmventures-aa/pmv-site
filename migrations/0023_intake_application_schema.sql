PRAGMA foreign_keys = ON;

-- Richer Service Catalog metadata for the client intake wizard.
ALTER TABLE services ADD COLUMN intake_intro TEXT;
ALTER TABLE services ADD COLUMN estimated_minutes INTEGER NOT NULL DEFAULT 3;

-- Existing columns already cover label/help text/type/options/required/step/sort.
-- These additions enable simple branching and repeatable/multiple inputs while
-- keeping question definitions editable from HQ Settings > Service Catalog.
ALTER TABLE onboarding_questions ADD COLUMN condition_question_key TEXT;
ALTER TABLE onboarding_questions ADD COLUMN condition_operator TEXT;
ALTER TABLE onboarding_questions ADD COLUMN condition_value TEXT;
ALTER TABLE onboarding_questions ADD COLUMN allow_multiple INTEGER NOT NULL DEFAULT 0;

-- One row per client application attempt. Draft rows support save-and-resume;
-- submitted rows become the durable Service Applications record.
CREATE TABLE service_applications (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL REFERENCES services(key),
  status TEXT NOT NULL DEFAULT 'draft',
  current_step INTEGER NOT NULL DEFAULT 0,
  submission_source TEXT NOT NULL DEFAULT 'portal',
  assigned_rep_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_unassigned INTEGER NOT NULL DEFAULT 0,
  may_require_attorney_coordination INTEGER NOT NULL DEFAULT 0,
  pdf_document_id TEXT REFERENCES client_documents(id) ON DELETE SET NULL,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_service_apps_client ON service_applications(client_user_id, created_at);
CREATE INDEX idx_service_apps_status ON service_applications(status, created_at);
CREATE UNIQUE INDEX idx_service_apps_one_draft
  ON service_applications(client_user_id, service_key)
  WHERE status = 'draft';

-- Snapshot labels and step metadata so historical applications remain readable
-- even if HQ later edits the catalog wording or order.
CREATE TABLE service_application_answers (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES service_applications(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES onboarding_questions(id) ON DELETE SET NULL,
  question_key TEXT NOT NULL,
  question_label TEXT NOT NULL,
  step_label TEXT,
  step_order INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(application_id, question_key)
);
CREATE INDEX idx_service_app_answers_application
  ON service_application_answers(application_id, step_order, sort_order);

-- Client-uploaded files and the generated internal PDF are normal document
-- records linked back to the application here.
CREATE TABLE service_application_attachments (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES service_applications(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
  question_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(application_id, document_id)
);
CREATE INDEX idx_service_app_attachments_application
  ON service_application_attachments(application_id, created_at);

-- Finish the document model around the existing R2 key so visibility is
-- enforced server-side instead of relying on the UI to hide internal files.
ALTER TABLE client_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'client';
ALTER TABLE client_documents ADD COLUMN content_type TEXT;
ALTER TABLE client_documents ADD COLUMN size_bytes INTEGER;
ALTER TABLE client_documents ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE client_documents ADD COLUMN uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_client_documents_visibility
  ON client_documents(client_user_id, visibility, created_at);
