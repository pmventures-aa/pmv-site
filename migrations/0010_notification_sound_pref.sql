-- Per-staff toggle for the notification chime (see src/lib/sound.ts). On by
-- default — most staff want to hear when something new lands.
ALTER TABLE notification_prefs ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1;
