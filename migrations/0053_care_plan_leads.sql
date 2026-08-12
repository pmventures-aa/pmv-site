PRAGMA foreign_keys = ON;

-- Care Plan leads captured from the public /care-plans intake wizard.
-- Every field selected in the wizard is preserved as JSON so no click is
-- wasted: the HQ team can see exactly which services and property/business
-- details the prospect chose. Follows the public_scope_requests pattern
-- (public token separate from internal id).
CREATE TABLE care_plan_leads (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  plan_family TEXT NOT NULL CHECK (plan_family IN ('property','ops','legal')),
  plan_tier TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_name TEXT,
  services_json TEXT NOT NULL DEFAULT '[]',
  intake_json TEXT NOT NULL DEFAULT '{}',
  additional_notes TEXT,
  source TEXT,
  audience TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','proposed','signed','declined','converted')),
  response_due_at TEXT NOT NULL,
  converted_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_care_plan_leads_status ON care_plan_leads(status, created_at);
CREATE INDEX idx_care_plan_leads_family ON care_plan_leads(plan_family, plan_tier, created_at);
CREATE INDEX idx_care_plan_leads_email ON care_plan_leads(email, created_at);
