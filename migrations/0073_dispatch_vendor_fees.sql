-- Snapdocs-style locally adjusted provider fees on field assignments.
ALTER TABLE field_assignments ADD COLUMN vendor_fee_base_cents INTEGER;
ALTER TABLE field_assignments ADD COLUMN vendor_fee_adjustment_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE field_assignments ADD COLUMN vendor_fee_cents INTEGER;
ALTER TABLE field_assignments ADD COLUMN vendor_fee_reason TEXT;
