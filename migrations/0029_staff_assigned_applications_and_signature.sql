PRAGMA foreign_keys = ON;

-- Lets staff/vendors open a service application on a client's behalf (see
-- POST /admin/clients/:id/services) instead of only the client self-starting
-- one. NULL means client-started, same as every application before this.
ALTER TABLE service_applications ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Lightweight electronic signature captured at submit time: a typed legal
-- name plus the timestamp/IP it was typed from. This is what makes a
-- staff-prefilled application still require the client to log in and
-- affirmatively sign before it counts as submitted.
ALTER TABLE service_applications ADD COLUMN signed_name TEXT;
ALTER TABLE service_applications ADD COLUMN signed_at TEXT;
ALTER TABLE service_applications ADD COLUMN signed_ip TEXT;

-- These two questions were free-text but only ever hold one of the 50
-- states + DC — turn them into proper dropdowns instead of asking a client
-- to type a state name correctly on mobile.
UPDATE onboarding_questions SET input_type = 'single_select', options = '["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"]'
WHERE service_key = 'business_formation' AND question_key = 'formation_state';

UPDATE onboarding_questions SET input_type = 'single_select', options = '["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"]'
WHERE service_key = 'compliance' AND question_key = 'existing_entity_state';
