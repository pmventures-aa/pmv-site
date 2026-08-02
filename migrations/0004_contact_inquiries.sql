-- Public "Request Service" contact form submissions (no auth required to submit).

CREATE TABLE contact_inquiries (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  service_key  TEXT REFERENCES services(key),
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new', -- new | contacted | closed
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_inquiries_status ON contact_inquiries(status);
