-- Let the visitor choose how the consultation happens.
--
-- Format was fixed per schedule, so a virtual schedule generated a Zoom
-- meeting for everyone. Some people would rather be phoned, and generating a
-- video link they will not use is both noise and a live join url with no
-- purpose.
--
-- Nullable with no default on purpose: existing rows predate the choice, and
-- writing 'virtual' into them would assert something about past bookings that
-- was never actually asked. Readers treat NULL as "whatever the schedule said
-- at the time".

ALTER TABLE consultation_bookings ADD COLUMN meeting_format TEXT
  CHECK (meeting_format IS NULL OR meeting_format IN ('virtual','phone'));
