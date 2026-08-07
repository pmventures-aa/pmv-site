-- Audit Log Center, part 2 (see docs/crm-expansion-design.md #4 and
-- migration 0014 for the audit_log table itself).
--
-- Rather than hand-instrumenting the ~30 existing activityInsert() call
-- sites across admin.ts/portal.ts/self.ts/public.ts/uploads.ts/conversion.ts
-- (real risk of missing one, and every future call site would need the
-- same treatment remembered forever), a single AFTER INSERT trigger on
-- activity_events mirrors every row into audit_log automatically. This
-- guarantees the two logs can never drift apart — anything that writes to
-- the activity feed is audited, with zero chance of a forgotten call site.
--
-- entity_id is COALESCE(client_user_id, actor_user_id) — activity_events
-- doesn't carry the specific matter/task/invoice id, only which client and
-- who acted, so that's the most specific identifier available without
-- changing every call site's signature. entity_type and action are
-- derived from `kind` by pattern; unrecognized future kinds fall through
-- to a generic 'record_updated' / NULL entity_type rather than failing the
-- insert that triggered them.
--
-- Actions that don't flow through activity_events at all (login/logout,
-- archive/restore/permanent-delete, file uploads that don't already log
-- an activity event) are written directly via auditInsert() — see
-- functions/_lib/auditLog.ts and functions/_lib/routes/deletion.ts.
CREATE TRIGGER trg_activity_to_audit
AFTER INSERT ON activity_events
BEGIN
  INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, after_json, created_at)
  VALUES (
    NEW.id || '-audit',
    NEW.actor_user_id,
    CASE
      WHEN NEW.kind LIKE '%\_status\_changed' ESCAPE '\' THEN 'status_changed'
      WHEN NEW.kind = 'staff_profile_updated' THEN 'permission_changed'
      WHEN NEW.kind = 'lead_converted' THEN 'client_converted'
      WHEN NEW.kind = 'avatar_updated' THEN 'file_uploaded'
      WHEN NEW.kind LIKE '%\_created' ESCAPE '\' THEN 'record_created'
      WHEN NEW.kind IN ('inquiry_submitted', 'client_signed_up', 'service_application_submitted') THEN 'record_created'
      ELSE 'record_updated'
    END,
    CASE
      WHEN NEW.kind LIKE 'matter\_%' ESCAPE '\' THEN 'matters'
      WHEN NEW.kind LIKE 'task\_%' ESCAPE '\' THEN 'client_tasks'
      WHEN NEW.kind LIKE 'ticket\_%' ESCAPE '\' THEN 'support_tickets'
      WHEN NEW.kind LIKE 'call\_%' ESCAPE '\' THEN 'planned_calls'
      WHEN NEW.kind LIKE 'appointment\_%' ESCAPE '\' THEN 'appointments'
      WHEN NEW.kind LIKE 'invoice\_%' ESCAPE '\' THEN 'invoices'
      WHEN NEW.kind LIKE 'funding\_%' ESCAPE '\' THEN 'funding_applications'
      WHEN NEW.kind LIKE 'property\_%' ESCAPE '\' THEN 'properties'
      WHEN NEW.kind LIKE 'tax\_filing\_%' ESCAPE '\' THEN 'tax_filings'
      WHEN NEW.kind LIKE 'inquiry\_%' ESCAPE '\' THEN 'contact_inquiries'
      WHEN NEW.kind = 'lead_converted' THEN 'contact_inquiries'
      WHEN NEW.kind LIKE 'user\_%' ESCAPE '\' THEN 'users'
      WHEN NEW.kind = 'client_signed_up' THEN 'users'
      WHEN NEW.kind = 'avatar_updated' THEN 'users'
      WHEN NEW.kind LIKE 'service\_%' ESCAPE '\' THEN 'client_services'
      WHEN NEW.kind = 'staff_profile_updated' THEN 'team_members'
      WHEN NEW.kind = 'payment_info_revealed' THEN 'client_payment_methods'
      WHEN NEW.kind = 'onboarding_completed' THEN 'client_profiles'
      ELSE NULL
    END,
    COALESCE(NEW.client_user_id, NEW.actor_user_id),
    NEW.detail,
    NEW.created_at
  );
END;
