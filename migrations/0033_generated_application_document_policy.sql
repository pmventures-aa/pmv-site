-- Finalized service-application PDFs are client records, not staff-only artifacts.
-- The PDF renderer is client-safe; internal workflow data stays in D1/audit logs.
-- Use an AFTER INSERT trigger so every future generated application copy lands
-- in the client's Documents section even if a route accidentally supplies the
-- legacy internal defaults.
CREATE TRIGGER IF NOT EXISTS trg_generated_application_client_document
AFTER INSERT ON client_documents
WHEN NEW.source = 'generated_service_application'
BEGIN
  UPDATE client_documents
  SET visibility = 'client', review_status = 'approved'
  WHERE id = NEW.id;
END;
