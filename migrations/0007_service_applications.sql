-- Multi-step "start a journey" application flow for services, plus secure
-- ACH collection. See functions/_lib/routes/self.ts for the endpoints that
-- use this schema.

PRAGMA foreign_keys = ON;

-- ---- Group onboarding_questions into wizard pages ----
-- step_order backfills existing rows to 1 (single page — unchanged behavior
-- for services that don't get a deeper flow below). step_label is left NULL
-- for those; the wizard renders a single unlabeled page when there's only
-- one step_order value for a service.
ALTER TABLE onboarding_questions ADD COLUMN step_label TEXT;
ALTER TABLE onboarding_questions ADD COLUMN step_order INTEGER NOT NULL DEFAULT 1;

-- ---- New service: Merchant Services ----
INSERT INTO services (key, name, description, category, sort_order) VALUES
  ('merchant_services', 'Merchant Services', 'Payment processing setup and rate review for card and online payments.', 'merchant', 25);

-- ---- Replace the shallow Consulting / Funding question sets with full,
-- multi-step application flows. Existing answers (client_onboarding_responses)
-- for these question_keys are orphaned, not deleted — no live clients have
-- submitted through these pre-launch placeholder questions yet.
DELETE FROM onboarding_questions WHERE service_key IN ('consulting', 'funding');

INSERT INTO onboarding_questions (id, service_key, question_key, label, help_text, input_type, options, required, sort_order, step_label, step_order) VALUES
  -- Consulting — Step 1: Business overview
  ('cons1', 'consulting', 'business_name',      'Business name',                       NULL, 'text',     NULL, 1, 10, 'Business overview', 1),
  ('cons2', 'consulting', 'entity_type',        'Entity type',                          NULL, 'select',   '["Sole Proprietorship","LLC","S-Corp","C-Corp","Partnership","Nonprofit","Not sure"]', 1, 20, 'Business overview', 1),
  ('cons3', 'consulting', 'industry',           'Industry',                             NULL, 'text',     NULL, 1, 30, 'Business overview', 1),
  ('cons4', 'consulting', 'years_in_business',  'Years in business',                    NULL, 'select',   '["Not yet launched","Under 1 year","1-3 years","3-5 years","5-10 years","10+ years"]', 1, 40, 'Business overview', 1),
  ('cons5', 'consulting', 'employee_count',     'Team size',                            NULL, 'select',   '["Just me","2-5","6-20","21-50","50+"]', 1, 50, 'Business overview', 1),
  -- Consulting — Step 2: Your goals
  ('cons6', 'consulting', 'consulting_focus',   'What do you need consulting support with?', NULL, 'select', '["Operations & Efficiency","Growth Strategy","Financial Management","Organizational Structure","Market Positioning","Other"]', 1, 10, 'Your goals', 2),
  ('cons7', 'consulting', 'primary_challenge',  'What''s the main challenge you''re looking to solve?', NULL, 'textarea', NULL, 1, 20, 'Your goals', 2),
  ('cons8', 'consulting', 'desired_outcome',    'What would a successful outcome look like?', NULL, 'textarea', NULL, 0, 30, 'Your goals', 2),
  ('cons9', 'consulting', 'timeline',           'Timeline',                             NULL, 'select',   '["ASAP","Within 30 days","Within 90 days","Just exploring"]', 1, 40, 'Your goals', 2),
  -- Consulting — Step 3: Current situation
  ('cons10','consulting', 'annual_revenue_range','Annual revenue range',                NULL, 'select',   '["Pre-revenue","Under $100k","$100k-$500k","$500k-$1M","$1M-$5M","$5M+"]', 1, 10, 'Current situation', 3),
  ('cons11','consulting', 'engagement_preference','Preferred engagement type',          NULL, 'select',   '["One-time project","Ongoing advisory","Not sure yet"]', 1, 20, 'Current situation', 3),
  ('cons12','consulting', 'budget_range',       'Budget range',                         NULL, 'select',   '["Under $2,500","$2,500-$10,000","$10,000-$25,000","$25,000+","Let''s discuss"]', 1, 30, 'Current situation', 3),

  -- Funding — Step 1: Business overview
  ('fund1', 'funding', 'legal_business_name',  'Legal business name',                   NULL, 'text',     NULL, 1, 10, 'Business overview', 1),
  ('fund2', 'funding', 'entity_type',          'Entity type',                           NULL, 'select',   '["Sole Proprietorship","LLC","S-Corp","C-Corp","Partnership","Nonprofit","Not sure"]', 1, 20, 'Business overview', 1),
  ('fund3', 'funding', 'industry',             'Industry',                              NULL, 'text',     NULL, 1, 30, 'Business overview', 1),
  ('fund4', 'funding', 'years_in_business',    'Years in business',                     NULL, 'select',   '["Not yet launched","Under 1 year","1-3 years","3-5 years","5-10 years","10+ years"]', 1, 40, 'Business overview', 1),
  ('fund5', 'funding', 'ein_status',           'EIN status',                            NULL, 'select',   '["Have an EIN","Applying for one","Not sure"]', 1, 50, 'Business overview', 1),
  -- Funding — Step 2: Funding need
  ('fund6', 'funding', 'amount_requested',     'How much funding are you seeking? (USD)', NULL, 'number', NULL, 1, 10, 'Funding need', 2),
  ('fund7', 'funding', 'use_of_funds',         'Primary use of funds',                  NULL, 'select',   '["Working Capital","Equipment","Expansion","Inventory","Payroll","Debt Refinance","Real Estate","Other"]', 1, 20, 'Funding need', 2),
  ('fund8', 'funding', 'use_of_funds_detail',  'Tell us more about how the funds will be used.', NULL, 'textarea', NULL, 0, 30, 'Funding need', 2),
  ('fund9', 'funding', 'funding_timeline',     'When do you need funding?',             NULL, 'select',   '["Immediately","Within 30 days","Within 90 days","Just researching"]', 1, 40, 'Funding need', 2),
  -- Funding — Step 3: Financial snapshot
  ('fund10','funding', 'monthly_revenue_range','Average monthly revenue',               NULL, 'select',   '["Under $10k","$10k-$50k","$50k-$150k","$150k-$500k","$500k+"]', 1, 10, 'Financial snapshot', 3),
  ('fund11','funding', 'existing_business_debt','Existing business debt',               NULL, 'select',   '["None","Under $50k","$50k-$250k","$250k+"]', 1, 20, 'Financial snapshot', 3),
  ('fund12','funding', 'credit_score_range',   'Estimated credit score range',          NULL, 'select',   '["Below 600","600-650","650-700","700-750","750+","Not sure"]', 1, 30, 'Financial snapshot', 3),
  ('fund13','funding', 'collateral_available', 'Collateral available',                  NULL, 'select',   '["Yes","No","Not sure"]', 1, 40, 'Financial snapshot', 3);

-- ---- Merchant Services — full multi-step application ----
INSERT INTO onboarding_questions (id, service_key, question_key, label, help_text, input_type, options, required, sort_order, step_label, step_order) VALUES
  -- Step 1: Business overview
  ('merc1', 'merchant_services', 'legal_business_name', 'Legal business name',          NULL, 'text',   NULL, 1, 10, 'Business overview', 1),
  ('merc2', 'merchant_services', 'dba_name',            'DBA / trade name (if different)', NULL, 'text', NULL, 0, 20, 'Business overview', 1),
  ('merc3', 'merchant_services', 'business_type',       'Business type',                 NULL, 'select', '["Retail","Restaurant","Professional Services","E-commerce","Nonprofit","Other"]', 1, 30, 'Business overview', 1),
  ('merc4', 'merchant_services', 'industry',            'Industry',                      NULL, 'text',   NULL, 1, 40, 'Business overview', 1),
  ('merc5', 'merchant_services', 'years_in_business',   'Years in business',             NULL, 'select', '["Not yet launched","Under 1 year","1-3 years","3-5 years","5-10 years","10+ years"]', 1, 50, 'Business overview', 1),
  -- Step 2: Processing profile
  ('merc6', 'merchant_services', 'business_model',      'How do you take payments?',     NULL, 'select', '["Card-present (in-person)","Card-not-present (online/phone)","Both"]', 1, 10, 'Processing profile', 2),
  ('merc7', 'merchant_services', 'average_monthly_volume','Average monthly card volume', NULL, 'select', '["Under $10k","$10k-$50k","$50k-$150k","$150k-$500k","$500k+"]', 1, 20, 'Processing profile', 2),
  ('merc8', 'merchant_services', 'average_ticket_size', 'Average transaction size',      NULL, 'select', '["Under $25","$25-$100","$100-$500","$500+"]', 1, 30, 'Processing profile', 2),
  ('merc9', 'merchant_services', 'seasonal_business',   'Is your business seasonal?',    NULL, 'select', '["Yes","No"]', 1, 40, 'Processing profile', 2),
  -- Step 3: Current setup
  ('merc10','merchant_services', 'has_current_processor','Do you currently accept card payments?', NULL, 'select', '["Yes, with a processor","No, this is new"]', 1, 10, 'Current setup', 3),
  ('merc11','merchant_services', 'current_processor_name','Current processor (if any)', NULL, 'text',   NULL, 0, 20, 'Current setup', 3),
  ('merc12','merchant_services', 'reason_for_switching','Reason for switching (if applicable)', NULL, 'textarea', NULL, 0, 30, 'Current setup', 3),
  ('merc13','merchant_services', 'pos_system',          'Point-of-sale / payment system in use, if any', NULL, 'text', NULL, 0, 40, 'Current setup', 3);

-- ---- Secure ACH collection (never card data — see functions/_lib/crypto.ts) ----
CREATE TABLE client_payment_methods (
  id                  TEXT PRIMARY KEY,
  client_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key         TEXT,                        -- application this was collected for, if any
  method_type         TEXT NOT NULL DEFAULT 'ach',  -- ach only; card PAN/CVV are never stored by this app
  account_holder_name TEXT NOT NULL,
  bank_name           TEXT,
  account_type        TEXT,                         -- checking | savings
  routing_number_enc  TEXT NOT NULL,                 -- AES-256-GCM, see encryptSensitive()
  account_number_enc  TEXT NOT NULL,
  account_last4       TEXT NOT NULL,                 -- plaintext, safe to display
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_paymethods_client ON client_payment_methods(client_user_id);
