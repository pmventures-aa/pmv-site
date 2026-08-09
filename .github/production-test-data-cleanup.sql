PRAGMA foreign_keys = OFF;

-- Messaging / communications
DELETE FROM message_attachments;
DELETE FROM thread_reads;
DELETE FROM thread_messages;
DELETE FROM message_threads;
DELETE FROM secure_messages;
DELETE FROM comms_recipients;
DELETE FROM comms_messages;

-- Applications / documents / client work
DELETE FROM service_application_attachments;
DELETE FROM service_application_answers;
DELETE FROM service_applications;
DELETE FROM client_onboarding_responses;
DELETE FROM client_payment_methods;
DELETE FROM client_services;
DELETE FROM document_requests;
DELETE FROM client_documents;
DELETE FROM client_tasks;
DELETE FROM internal_notes;
DELETE FROM support_tickets;
DELETE FROM planned_calls;
DELETE FROM appointments;
DELETE FROM funding_applications;
DELETE FROM tax_filings;
DELETE FROM properties;
DELETE FROM matters;

-- Billing / reporting
DELETE FROM invoice_line_items;
DELETE FROM invoice_reminders;
DELETE FROM invoices;
DELETE FROM scheduled_report_runs;
DELETE FROM report_templates;

-- CRM / lead data
DELETE FROM crm_list_members;
DELETE FROM crm_record_tags;
DELETE FROM crm_imports;
DELETE FROM crm_lists;
DELETE FROM crm_tags;
DELETE FROM lead_conversions;
DELETE FROM contact_inquiries;

-- Delivery / audit / operational histories created during QA
DELETE FROM email_unsubscribe_tokens;
DELETE FROM email_webhook_events;
DELETE FROM email_log;
DELETE FROM account_email_deliveries;
DELETE FROM activity_events;
DELETE FROM audit_log;
DELETE FROM permanent_deletions;

-- Identity-linked rows. Keep only the Pinnacle owner account and its team profile/preferences.
DELETE FROM staff_assignments;
DELETE FROM notification_prefs
WHERE user_id NOT IN (SELECT id FROM users WHERE lower(email) = 'cjenkins@pinnaclemanagementventures.com');
DELETE FROM team_members
WHERE user_id NOT IN (SELECT id FROM users WHERE lower(email) = 'cjenkins@pinnaclemanagementventures.com');
DELETE FROM client_profiles;
DELETE FROM users WHERE lower(email) <> 'cjenkins@pinnaclemanagementventures.com';

PRAGMA foreign_keys = ON;
