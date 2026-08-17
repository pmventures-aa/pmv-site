-- Proof-of-work location association for field assignment documents.
--
-- Pairs with the field-location tracking program (migrations 0078-0080).
-- The spec calls this out explicitly:
--
--   "When field proof is uploaded, optionally associate:
--     captured_at
--     upload_latitude
--     upload_longitude
--     location_accuracy
--     assignment_id
--   with the proof record.
--   Preserve the original proof file and relevant metadata.
--   Clearly distinguish:
--     Photo EXIF location
--   from:
--     Pinnacle app location at upload
--   Do not pretend they are the same."
--
-- All four columns are nullable so records created before this
-- migration remain valid and so a provider on a device without
-- location permission can still record documents. Anywhere these
-- columns surface in the UI they must be labeled "Pinnacle app
-- location at record" and never conflated with EXIF - Pinnacle never
-- reads EXIF today, so there is no possibility of confusion at the
-- ingest layer.

ALTER TABLE field_assignment_documents ADD COLUMN app_captured_at        TEXT;
ALTER TABLE field_assignment_documents ADD COLUMN app_capture_latitude   REAL;
ALTER TABLE field_assignment_documents ADD COLUMN app_capture_longitude  REAL;
ALTER TABLE field_assignment_documents ADD COLUMN app_capture_accuracy_m REAL;
