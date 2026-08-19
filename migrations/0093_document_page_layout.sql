-- Per-document page geometry for the Document Hub editor, so preview, print,
-- and PDF export all share one page size (Letter/Legal/A4) and margin preset.
ALTER TABLE internal_documents ADD COLUMN page_size TEXT NOT NULL DEFAULT 'letter';
ALTER TABLE internal_documents ADD COLUMN page_margins TEXT NOT NULL DEFAULT 'normal';
