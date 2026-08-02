-- Pinnacle Management Ventures — realign services catalog with actual offerings
-- (Consulting, Funding & Capital, Property Management, Mobile Notary,
--  Property Inspections, Document Courier, Administrative Support), replacing
-- the placeholder tax/compliance/formation catalog seeded in 0002. Safe to run
-- pre-launch (no live client_services/onboarding_responses reference the old keys).

DELETE FROM onboarding_questions;
DELETE FROM client_services;
DELETE FROM client_onboarding_responses;
DELETE FROM services;

INSERT INTO services (key, name, description, category, sort_order) VALUES
  ('consulting',            'Consulting',                'Strategic guidance for business operations, growth, and organizational efficiency.', 'consulting', 10),
  ('funding',                'Funding & Capital',         'Explore funding opportunities and connect with financing solutions for growth.', 'funding', 20),
  ('property_management',   'Property Management',       'Tenant coordination, maintenance scheduling, and financial reporting.', 'property', 30),
  ('mobile_notary',          'Mobile Notary',              'Commissioned Florida notary services at your location.', 'notary', 40),
  ('property_inspections',  'Property Inspections',      'Detailed property assessments and condition reports.', 'property', 50),
  ('document_courier',       'Document Courier',           'Secure, timely delivery of important documents.', 'courier', 60),
  ('admin_support',          'Administrative Support',     'Filing, scheduling, correspondence, and day-to-day tasks.', 'admin', 70);

INSERT INTO onboarding_questions (id, service_key, question_key, label, help_text, input_type, options, required, sort_order) VALUES
  ('q1',  'consulting',           'consulting_focus',       'What would you like consulting support with?', NULL, 'select', '["Operations","Growth Strategy","Organizational Efficiency","Not sure"]', 1, 10),
  ('q2',  'consulting',           'business_challenge',     'Briefly describe the challenge you''re facing.', NULL, 'textarea', NULL, 1, 20),

  ('q3',  'funding',              'funding_amount',         'How much funding are you seeking?', NULL, 'text', NULL, 1, 10),
  ('q4',  'funding',              'funding_purpose',        'What will the funds be used for?', NULL, 'textarea', NULL, 1, 20),

  ('q5',  'property_management',  'property_address',       'Property address', NULL, 'text', NULL, 1, 10),
  ('q6',  'property_management',  'property_type',          'Property type', NULL, 'select', '["Residential","Commercial","Mixed-use"]', 1, 20),
  ('q7',  'property_management',  'num_units',               'Number of units', NULL, 'text', NULL, 0, 30),

  ('q8',  'mobile_notary',        'notary_document_type',   'What type of document needs notarizing?', NULL, 'text', NULL, 1, 10),
  ('q9',  'mobile_notary',        'preferred_location',      'Where should the notary meet you? (address)', NULL, 'text', NULL, 1, 20),

  ('q10', 'property_inspections', 'inspection_property_address', 'Property address', NULL, 'text', NULL, 1, 10),
  ('q11', 'property_inspections', 'inspection_reason',      'Reason for inspection', NULL, 'select', '["Pre-purchase","Routine","Insurance","Other"]', 1, 20),

  ('q12', 'document_courier',     'pickup_address',          'Pickup address', NULL, 'text', NULL, 1, 10),
  ('q13', 'document_courier',     'delivery_address',        'Delivery address', NULL, 'text', NULL, 1, 20),

  ('q14', 'admin_support',        'support_tasks_needed',   'What tasks do you need help with?', NULL, 'textarea', NULL, 1, 10),
  ('q15', 'admin_support',        'hours_per_week',          'Approximate hours needed per week', NULL, 'select', '["Under 5","5-10","10-20","20+"]', 1, 20);
