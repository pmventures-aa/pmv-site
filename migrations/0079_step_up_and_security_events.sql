-- Step-up verification and security event scaffolding.
--
-- Pairs with the granular authorization core in migration 0078: the
-- PERMISSION_CATALOG marks step_up = 1 on sensitive actions
-- (banking.reveal, billing.process_refund, users.assign_roles,
-- security.manage, firm_settings.manage, vendor.payment_change).
-- authorize() denies those actions with reason 'step_up_required' unless
-- the caller passes context.stepUp = true. This migration gives the
-- server the store it needs to verify that flag at request time without
-- relying on a client-controlled boolean.
--
-- Two tables:
--
-- step_up_verifications
--   One row per successful re-authentication. Short-lived (typically 5m
--   for reveal-class actions, 15m for administrative changes). Bound to
--   a specific action_key so a step-up gained to reveal a bank account
--   cannot be replayed to change a firm setting. The consumed_at column
--   supports single-use tokens; long-lived flows can leave it null and
--   rely on expires_at.
--
-- security_events
--   A curated projection over audit_log for the security surfaces from
--   the spec (Banking Reveals, Permission Changes, Sensitive Exports,
--   Login Anomalies, User Administration). Written in parallel to
--   audit_log by recordSecurityEvent(), never edited by app code. The
--   audit_log row remains the system of record; security_events exists
--   so the auditor console can filter and paginate without scanning the
--   full audit_log table on every load.

CREATE TABLE step_up_verifications (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  action_key     TEXT NOT NULL,                      -- e.g. 'banking.reveal'
  method         TEXT NOT NULL,                      -- 'password' | 'totp' | 'webauthn' | 'sso_reauth'
  reason         TEXT,                               -- caller-supplied justification (audit-visible)
  verified_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,                      -- ISO8601; enforced in checkStepUp()
  consumed_at    TEXT,                               -- set on single-use verifications after checkStepUp() succeeds
  actor_ip       TEXT,
  actor_city     TEXT,
  actor_region   TEXT,
  actor_country  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_step_up_user_action ON step_up_verifications(user_id, action_key);
CREATE INDEX idx_step_up_expires ON step_up_verifications(expires_at);

CREATE TABLE security_events (
  id              TEXT PRIMARY KEY,
  audit_log_id    TEXT REFERENCES audit_log(id),   -- paired audit_log row when one exists
  actor_user_id   TEXT REFERENCES users(id),
  impersonator_id TEXT REFERENCES users(id),       -- populated when the actor acted via impersonation
  event_key       TEXT NOT NULL,                    -- from the spec's security event vocabulary (see below)
  severity        TEXT NOT NULL DEFAULT 'info'
                   CHECK (severity IN ('info','notice','warning','critical')),
  resource_type   TEXT,
  resource_id     TEXT,
  reason          TEXT,                              -- non-sensitive justification / context
  metadata_json   TEXT,                              -- caller-provided extra context (never secrets)
  actor_ip        TEXT,
  actor_city      TEXT,
  actor_region    TEXT,
  actor_country   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_security_events_actor ON security_events(actor_user_id);
CREATE INDEX idx_security_events_event ON security_events(event_key);
CREATE INDEX idx_security_events_created ON security_events(created_at);
CREATE INDEX idx_security_events_resource ON security_events(resource_type, resource_id);

-- Vocabulary that recordSecurityEvent() writes into event_key. The list
-- is documented here rather than a CHECK constraint so new event types
-- don't require a migration; the shared/security.ts helper enforces the
-- typed union at the call site.
--
--   BANKING_REVEALED
--   BANK_ACCOUNT_UPDATED
--   ROLE_ASSIGNED
--   ROLE_REMOVED
--   PERMISSION_CHANGED
--   USER_CREATED
--   USER_SUSPENDED
--   MFA_CHANGED
--   LOGIN_FAILED
--   SENSITIVE_EXPORT
--   DOCUMENT_EXPORTED
--   DOCUMENT_VOIDED
--   VENDOR_APPROVED
--   VENDOR_SUSPENDED
--   REFUND_PROCESSED
--   FIRM_SETTING_CHANGED
--   IMPERSONATION_STARTED
--   IMPERSONATION_ENDED
--   STEP_UP_VERIFIED
--   STEP_UP_FAILED
