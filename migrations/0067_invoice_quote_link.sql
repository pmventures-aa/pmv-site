PRAGMA foreign_keys = ON;

-- Link an invoice back to the accepted quote it was converted from.
-- A quote may produce at most one live (non-void) invoice.
ALTER TABLE invoices ADD COLUMN quote_id TEXT REFERENCES service_quotes(id) ON DELETE SET NULL;
CREATE INDEX idx_invoices_quote ON invoices(quote_id);
CREATE UNIQUE INDEX idx_invoices_quote_live ON invoices(quote_id) WHERE quote_id IS NOT NULL AND status != 'void';
