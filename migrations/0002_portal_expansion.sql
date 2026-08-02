-- Pinnacle Management Ventures — portal expansion
-- Adds: name fields, services catalog + dynamic onboarding, planned calls,
-- properties, tax filings, and thread linkage for support/messages.

PRAGMA foreign_keys = ON;

-- ---- Name fields on users ----
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

-- ---- Onboarding completion flag on client_profiles ----
ALTER TABLE client_profiles ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;

-- ---- Services catalog ----
CREATE TABLE services (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

-- ---- Dynamic onboarding questions, scoped per service ----
CREATE TABLE onboarding_questions (
  id            TEXT PRIMARY KEY,
  service_key   TEXT NOT NULL REFERENCES services(key) ON DELETE CASCADE,
  question_key  TEXT NOT NULL,
  label         TEXT NOT NULL,
  help_text     TEXT,
  input_type    TEXT NOT NULL DEFAULT 'text',
  options       TEXT,
  required      INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(service_key, question_key)
);
CREATE INDEX idx_onbq_service ON onboarding_questions(service_key);

-- ---- Which services a client is enrolled in / interested in ----
CREATE TABLE client_services (
  id             TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key    TEXT NOT NULL REFERENCES services(key),
  status         TEXT NOT NULL DEFAULT 'requested',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_user_id, service_key)
);
CREATE INDEX idx_clientsvc_client ON client_services(client_user_id);

-- ---- Answers to dynamic onboarding questions ----
CREATE TABLE client_onboarding_responses (
  id             TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key    TEXT NOT NULL,
  question_key   TEXT NOT NULL,
  value          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_user_id, service_key, question_key)
);
CREATE INDEX idx_onbr_client ON client_onboarding_responses(client_user_id);

-- ---- Planned / requested calls ----
CREATE TABLE planned_calls (
  id             TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic          TEXT NOT NULL,
  preferred_times TEXT,
  status         TEXT NOT NULL DEFAULT 'requested',
  scheduled_at   TEXT,
  staff_user_id  TEXT REFERENCES users(id),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calls_client ON planned_calls(client_user_id);

-- ---- Property support module ----
CREATE TABLE properties (
  id             TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address        TEXT NOT NULL,
  property_type  TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_props_client ON properties(client_user_id);

-- ---- Tax module ----
CREATE TABLE tax_filings (
  id             TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year       INTEGER NOT NULL,
  filing_type    TEXT,
  status         TEXT NOT NULL DEFAULT 'not_started',
  due_date       TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tax_client ON tax_filings(client_user_id);

-- ---- Thread linkage ----
ALTER TABLE secure_messages ADD COLUMN ticket_id TEXT REFERENCES support_tickets(id);
ALTER TABLE support_tickets ADD COLUMN category TEXT;
ALTER TABLE client_documents ADD COLUMN file_name TEXT;

-- ---- Seed service catalog ----
INSERT INTO services (key, name, description, category, sort_order) VALUES
  ('business_formation', 'Business Formation', 'LLC/corporation formation and entity setup.', 'formation', 10),
  ('compliance', 'Compliance & Registered Agent', 'Annual reports, registered agent, state compliance.', 'compliance', 20),
  ('bookkeeping', 'Bookkeeping', 'Monthly bookkeeping and financial statements.', 'bookkeeping', 30),
  ('tax_prep', 'Tax Preparation', 'Federal and state tax return preparation.', 'tax', 40),
  ('tax_resolution', 'Tax Resolution', 'IRS/state tax debt resolution and representation.', 'tax', 50),
  ('funding', 'Business Funding', 'Funding applications and capital access support.', 'funding', 60),
  ('property_support', 'Property Support', 'Support for investment or business real property.', 'property', 70);

-- ---- Seed onboarding questions (dynamic per service) ----
INSERT INTO onboarding_questions (id, service_key, question_key, label, help_text, input_type, options, required, sort_order) VALUES
  ('q1',  'business_formation', 'entity_type',       'What entity type do you want to form?', NULL, 'select', '["LLC","S-Corp","C-Corp","Nonprofit","Not sure"]', 1, 10),
  ('q2',  'business_formation', 'formation_state',   'Which state will you form in?', NULL, 'text', NULL, 1, 20),
  ('q3',  'business_formation', 'business_purpose',  'Briefly describe the business purpose.', NULL, 'textarea', NULL, 1, 30),
  ('q4',  'compliance',         'existing_entity_state', 'State where your entity is currently registered.', NULL, 'text', NULL, 1, 10),
  ('q5',  'compliance',         'registered_agent_needed', 'Do you need registered agent service?', NULL, 'select', '["Yes","No","Not sure"]', 1, 20),
  ('q6',  'bookkeeping',        'monthly_transactions', 'Roughly how many transactions per month?', NULL, 'select', '["Under 25","25-100","100-500","500+"]', 1, 10),
  ('q7',  'bookkeeping',        'current_software',  'What accounting software do you currently use, if any?', NULL, 'text', NULL, 0, 20),
  ('q8',  'tax_prep',           'tax_years_needed',  'Which tax year(s) need to be filed?', NULL, 'text', NULL, 1, 10),
  ('q9',  'tax_prep',           'entity_tax_type',   'How is your business taxed?', NULL, 'select', '["Sole Prop","LLC (default)","S-Corp","C-Corp","Partnership","Not sure"]', 1, 20),
  ('q10', 'tax_resolution',     'debt_amount_range', 'Approximate amount owed to tax authorities.', NULL, 'select', '["Under $10k","$10k-$50k","$50k-$250k","$250k+"]', 1, 10),
  ('q11', 'tax_resolution',     'notices_received',  'Have you received any IRS/state notices?', NULL, 'select', '["Yes","No"]', 1, 20),
  ('q12', 'funding',            'amount_requested',  'How much funding are you seeking?', NULL, 'text', NULL, 1, 10),
  ('q13', 'funding',            'use_of_funds',      'What will the funds be used for?', NULL, 'textarea', NULL, 1, 20),
  ('q14', 'property_support',   'property_address',  'Property address', NULL, 'text', NULL, 1, 10),
  ('q15', 'property_support',   'support_type',      'What kind of support do you need?', NULL, 'select', '["Acquisition","Management","Disposition","Financing"]', 1, 20);
