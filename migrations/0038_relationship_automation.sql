-- Relationship automation, notification subscriptions, branded event templates, and 14-day client nurture.

CREATE TABLE IF NOT EXISTS notification_event_catalog (
  event_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('staff','client','both')),
  description TEXT,
  default_in_app INTEGER NOT NULL DEFAULT 1,
  default_email INTEGER NOT NULL DEFAULT 0,
  client_configurable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_user_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL REFERENCES notification_event_catalog(event_key) ON DELETE CASCADE,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, event_key)
);

CREATE TABLE IF NOT EXISTS notification_template_overrides (
  event_key TEXT PRIMARY KEY REFERENCES notification_event_catalog(event_key) ON DELETE CASCADE,
  subject TEXT,
  preheader TEXT,
  eyebrow TEXT,
  title TEXT,
  body_html TEXT,
  cta_label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_nurture_enrollments (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL DEFAULT 'client_discovery_14d',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','unsubscribed')),
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  next_step INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_nurture_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,
  step_key TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, campaign_key, step_key)
);

CREATE TABLE IF NOT EXISTS client_notification_outbox (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL REFERENCES notification_event_catalog(event_key),
  entity_type TEXT,
  entity_id TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_nurture_due ON client_nurture_enrollments(status, enrolled_at, next_step);
CREATE INDEX IF NOT EXISTS idx_client_notification_outbox_pending ON client_notification_outbox(status, created_at);

CREATE TRIGGER IF NOT EXISTS trg_client_nurture_enroll
AFTER INSERT ON users
WHEN NEW.role = 'client'
BEGIN
  INSERT OR IGNORE INTO client_nurture_enrollments(user_id,campaign_key,status,enrolled_at,next_step)
  VALUES(NEW.id,'client_discovery_14d','active',datetime('now'),1);
END;

INSERT OR IGNORE INTO notification_event_catalog(event_key,label,category,audience,description,default_in_app,default_email,client_configurable,sort_order) VALUES
('client_signed_up','New client registration','Clients','staff','A new client creates a Pinnacle account.',1,1,0,10),
('lead_created','New lead or prospect','CRM','staff','A new lead or prospect is added.',1,1,0,20),
('service_application_submitted','Service application submitted','Services','both','A client submits a service application.',1,1,1,30),
('service_application_approved','Service application approved','Services','client','A service application is approved or moved forward.',1,1,1,40),
('service_assigned','Service assigned','Services','client','Pinnacle assigns or opens a service for the client.',1,1,1,50),
('vendor_signup_submitted','New provider application','Providers','staff','A professional applies to join the Pinnacle network.',1,1,0,60),
('vendor_approved','Provider approved','Providers','staff','A provider is approved for the Pinnacle network.',1,0,0,70),
('document_uploaded','New document uploaded','Documents','both','A new document is added to a client relationship.',1,0,1,80),
('message_received','New message','Communication','both','A new secure message is received.',1,1,1,90),
('appointment_scheduled','Appointment scheduled','Calendar','both','A new appointment is scheduled.',1,1,1,100),
('invoice_created','New invoice','Billing','client','A new invoice is created for a client.',1,1,1,110),
('invoice_due','Invoice due reminder','Billing','client','An invoice is approaching or past its due date.',1,1,1,120),
('service_completed','Service completed','Services','client','A Pinnacle service is marked complete.',1,1,1,130),
('trusted_contact_invited','Trusted Contact invited','Access','client','A Trusted Contact invitation is created.',1,0,1,140),
('trusted_contact_accepted','Trusted Contact accepted','Access','client','A Trusted Contact accepts the invitation.',1,1,1,150),
('trusted_contact_expired','Trusted Contact invitation expired','Access','client','A Trusted Contact invitation expires before acceptance.',1,0,1,160),
('client_inactive_30d','Client inactive for 30 days','Client success','staff','A client has had no meaningful activity for 30 days.',1,0,0,170),
('unanswered_message','Message awaiting response','Communication','staff','A client message has not received a response.',1,0,0,180),
('application_stale','Application needs follow-up','Services','staff','A started application has not been completed.',1,0,0,190);

-- Event outbox: capture relationship events at the data boundary so individual
-- routes do not need to implement their own email delivery logic.
CREATE TRIGGER IF NOT EXISTS trg_notify_invoice_created
AFTER INSERT ON invoices
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'invoice_created','invoice',NEW.id,
         json_object('amount_cents',NEW.amount_cents,'due_date',NEW.due_date));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_appointment_scheduled
AFTER INSERT ON appointments
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'appointment_scheduled','appointment',NEW.id,
         json_object('title',COALESCE(NEW.title,'Appointment'),'starts_at',NEW.starts_at));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_document_uploaded
AFTER INSERT ON client_documents
WHEN COALESCE(NEW.visibility,'client') != 'internal'
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'document_uploaded','document',NEW.id,
         json_object('file_name',COALESCE(NEW.file_name,'New document'),'category',COALESCE(NEW.category,'document')));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_service_assigned
AFTER INSERT ON client_services
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'service_assigned','client_service',NEW.id,
         json_object('service_key',NEW.service_key,'status',NEW.status));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_service_completed
AFTER UPDATE OF status ON client_services
WHEN NEW.status='completed' AND OLD.status!='completed'
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'service_completed','client_service',NEW.id,
         json_object('service_key',NEW.service_key));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_application_submitted
AFTER UPDATE OF status ON service_applications
WHEN NEW.status='submitted' AND OLD.status!='submitted'
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'service_application_submitted','service_application',NEW.id,
         json_object('service_key',NEW.service_key));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_application_approved
AFTER UPDATE OF status ON service_applications
WHEN NEW.status='approved' AND OLD.status!='approved'
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'service_application_approved','service_application',NEW.id,
         json_object('service_key',NEW.service_key));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_trusted_contact_accepted
AFTER UPDATE OF status ON trusted_contacts
WHEN NEW.status='active' AND OLD.status!='active'
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'trusted_contact_accepted','trusted_contact',NEW.id,
         json_object('full_name',NEW.full_name,'email',NEW.email));
END;

CREATE TRIGGER IF NOT EXISTS trg_notify_staff_message
AFTER INSERT ON secure_messages
WHEN EXISTS (SELECT 1 FROM users sender WHERE sender.id=NEW.sender_user_id AND sender.role IN ('staff','admin'))
BEGIN
  INSERT INTO client_notification_outbox(id,client_user_id,event_key,entity_type,entity_id,payload_json)
  VALUES(lower(hex(randomblob(16))),NEW.client_user_id,'message_received','secure_message',NEW.id,
         json_object('preview',substr(NEW.body,1,180)));
END;
