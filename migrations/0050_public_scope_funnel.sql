PRAGMA foreign_keys = ON;

-- Public, account-free scope requests. The public token is deliberately
-- separate from the internal id so confirmation and signup links never expose
-- sequential or staff-facing identifiers.
CREATE TABLE public_scope_requests (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  inquiry_id TEXT REFERENCES contact_inquiries(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  service_key TEXT REFERENCES services(key) ON DELETE SET NULL,
  offering_id TEXT REFERENCES service_offerings(id) ON DELETE SET NULL,
  guide_slug TEXT,
  audience TEXT,
  location_type TEXT NOT NULL DEFAULT 'onsite',
  city TEXT,
  state TEXT,
  postal_code TEXT,
  timing TEXT NOT NULL,
  details TEXT,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  follow_up_opt_in INTEGER NOT NULL DEFAULT 0,
  marketing_status TEXT NOT NULL DEFAULT 'emailable',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','quoted','booked','converted','closed')),
  response_due_at TEXT NOT NULL,
  estimate_low_cents INTEGER,
  estimate_high_cents INTEGER,
  estimate_basis TEXT,
  quote_inputs_json TEXT,
  preferred_slot_at TEXT,
  booked_at TEXT,
  converted_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_public_scope_status ON public_scope_requests(status, created_at);
CREATE INDEX idx_public_scope_email ON public_scope_requests(email, created_at);
CREATE INDEX idx_public_scope_followup ON public_scope_requests(follow_up_opt_in, marketing_status, status, created_at);

-- HQ publishes only appointment capacity that can actually be honored. Public
-- quote customers can confirm one of these slots immediately; an arbitrary
-- preferred time is never presented as a completed booking.
CREATE TABLE public_service_slots (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('cleaning_turnover','property_inspection')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 25),
  booked_count INTEGER NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  internal_note TEXT,
  last_reservation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (ends_at > starts_at),
  CHECK (booked_count <= capacity)
);
CREATE INDEX idx_public_service_slots_available ON public_service_slots(job_type, active, starts_at);

CREATE TABLE public_scope_bookings (
  id TEXT PRIMARY KEY,
  scope_request_id TEXT NOT NULL UNIQUE REFERENCES public_scope_requests(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES public_service_slots(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed')),
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_public_scope_bookings_slot ON public_scope_bookings(slot_id, status);

CREATE TABLE scope_followup_deliveries (
  id TEXT PRIMARY KEY,
  scope_request_id TEXT NOT NULL REFERENCES public_scope_requests(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope_request_id, step_key)
);

-- Quote rules remain editable data rather than hard-coded public promises.
-- The starting rules are conservative planning ranges; staff can tune them in
-- HQ without a deployment.
CREATE TABLE public_quote_rules (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  service_key TEXT NOT NULL REFERENCES services(key) ON DELETE CASCADE,
  base_price_cents INTEGER NOT NULL,
  per_sqft_cents INTEGER NOT NULL DEFAULT 0,
  minimum_price_cents INTEGER NOT NULL,
  range_low_percent INTEGER NOT NULL DEFAULT 90,
  range_high_percent INTEGER NOT NULL DEFAULT 115,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO public_quote_rules(key,label,service_key,base_price_cents,per_sqft_cents,minimum_price_cents,range_low_percent,range_high_percent) VALUES
  ('clean_standard','Standard property cleaning','property_management',12500,16,12500,90,115),
  ('clean_deep','Deep property cleaning','property_management',19500,22,19500,90,120),
  ('clean_moveout','Move-out / turnover cleaning','property_management',22500,28,22500,90,120);

-- Only explicitly approved, redacted records are published. No private client
-- job or field-assignment data is exposed automatically.
CREATE TABLE public_case_studies (
  id TEXT PRIMARY KEY,
  service_key TEXT REFERENCES services(key) ON DELETE SET NULL,
  guide_slug TEXT,
  audience TEXT,
  headline TEXT NOT NULL,
  outcome TEXT NOT NULL,
  timeline_label TEXT NOT NULL,
  redacted_location TEXT,
  image_url TEXT,
  image_alt TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_public_case_published ON public_case_studies(published, sort_order, updated_at);

-- One immutable public snapshot per calendar month. The public endpoint creates
-- the current month on first request and serves the same verified values for
-- the rest of the month.
CREATE TABLE public_metric_snapshots (
  month_key TEXT PRIMARY KEY,
  properties_served INTEGER NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  average_response_minutes INTEGER,
  states_covered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
