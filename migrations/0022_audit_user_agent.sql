-- Audit Log Center, part 3 (see migration 0014 for the audit_log table).
--
-- Adds the requesting client's User-Agent alongside the IP already
-- captured, so an audit row can be attributed to a specific device/browser
-- during an investigation, not just an IP. Nullable and additive — existing
-- rows (and any insert that doesn't pass one) just get NULL, same as
-- actor_ip already does for triggered inserts (activity_events rows carry
-- no request context at all).
ALTER TABLE audit_log ADD COLUMN actor_user_agent TEXT;

-- Also attributes the new client_profile_updated activity kind (added
-- alongside the Profile/Dashboard restructure) to its entity_type, the
-- same way every other entity already is — see migration 0018's comment.
-- Without this it still reaches audit_log via the trigger's ELSE branches,
-- just with entity_type NULL instead of 'client_profiles'.
DROP TRIGGER trg_activity_to_audit;

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
      WHEN NEW.kind = 'message_attachment_added' THEN 'file_uploaded'
      WHEN NEW.kind IN ('message_received', 'message_sent') THEN 'record_created'
      WHEN NEW.kind = 'client_profile_updated' THEN 'record_updated'
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
      WHEN NEW.kind = 'client_profile_updated' THEN 'client_profiles'
      WHEN NEW.kind LIKE 'message\_%' ESCAPE '\' THEN 'message_threads'
      ELSE NULL
    END,
    COALESCE(NEW.client_user_id, NEW.actor_user_id),
    NEW.detail,
    NEW.created_at
  );
END;
