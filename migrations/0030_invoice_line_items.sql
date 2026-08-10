PRAGMA foreign_keys = ON;

-- Richer invoice record: title/number/message for client-facing context, an
-- optional Bill To override (defaults to the client's own profile when left
-- blank), and server-computed totals broken out from the final amount_cents
-- so the UI can show a real subtotal/discount/tax breakdown. Still no
-- payment gateway involved anywhere here — amount_cents stays the field
-- staff mark paid/void against, same as before.
ALTER TABLE invoices ADD COLUMN invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN title TEXT;
ALTER TABLE invoices ADD COLUMN message TEXT;
ALTER TABLE invoices ADD COLUMN subtotal_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN tax_rate_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN bill_to_name TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_company TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_email TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_phone TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_address_line1 TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_city TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_state TEXT;
ALTER TABLE invoices ADD COLUMN bill_to_postal_code TEXT;
ALTER TABLE invoices ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN last_reminded_at TEXT;

CREATE TABLE invoice_line_items (
  id                TEXT PRIMARY KEY,
  invoice_id        TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  quantity          REAL NOT NULL DEFAULT 1,
  unit_price_cents  INTEGER NOT NULL DEFAULT 0,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  taxable           INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
