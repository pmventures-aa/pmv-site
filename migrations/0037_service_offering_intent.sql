PRAGMA foreign_keys = ON;

-- Preserve the specific one-time offering that brought a client into a broader
-- service application. The offering library is a curated product/menu layer;
-- the parent service remains the durable application/intake definition.
ALTER TABLE service_applications ADD COLUMN requested_offering_id TEXT;
CREATE INDEX idx_service_apps_offering ON service_applications(requested_offering_id, created_at);
