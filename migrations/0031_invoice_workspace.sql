PRAGMA foreign_keys = ON;

-- Rich internal invoice workspace. Existing amount_cents/status/due_date remain
-- authoritative compatibility fields for dashboards and the client portal.
ALTER TABLE invoices ADD COLUMN invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN customer_number TEXT;
ALTER TABLE invoices ADD COLUMN title TEXT;
ALTER TABLE invoices ADD COLUMN issue_date TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_json TEXT;
ALTER TABLE invoices ADD COLUMN payable_to_json TEXT;
ALTER TABLE invoices ADD COLUMN message TEXT;
ALTER TABLE invoices ADD COLUMN custom_field_group TEXT;
ALTER TABLE invoices ADD COLUMN payment_methods_json TEXT;
ALTER TABLE invoices ADD COLUMN card_processor_label TEXT;
ALTER TABLE invoices ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE invoices ADD COLUMN ach_processor_label TEXT;
ALTER TABLE invoices ADD COLUMN ach_sec_codes_json TEXT;
ALTER TABLE invoices ADD COLUMN partial_payment_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE invoices ADD COLUMN partial_payment_amount_cents INTEGER;
ALTER TABLE invoices ADD COLUMN require_shipping_details INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN save_customer_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE invoices ADD COLUMN delivery_channel TEXT NOT NULL DEFAULT 'email';
ALTER TABLE invoices ADD COLUMN additional_emails TEXT;
ALTER TABLE invoices ADD COLUMN send_receipt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN subtotal_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN shipping_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN sent_at TEXT;
ALTER TABLE invoices ADD COLUMN updated_at TEXT;

CREATE UNIQUE INDEX idx_invoices_invoice_number ON invoices(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX idx_invoices_due_status ON invoices(status, due_date);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  shipped INTEGER NOT NULL DEFAULT 0,
  taxable INTEGER NOT NULL DEFAULT 0,
  local_tax_rate REAL NOT NULL DEFAULT 0,
  national_tax_rate REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id, sort_order);

CREATE TABLE invoice_reminders (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  days_offset INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoice_reminders_invoice ON invoice_reminders(invoice_id);
