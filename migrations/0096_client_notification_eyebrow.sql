-- Correct the eyebrow on already-seeded client notification templates.
--
-- notify_* rows in hq_email_templates were seeded before those rows drove
-- anything client-facing, so every one of them carries the staff eyebrow
-- "Pinnacle HQ notification". Client notifications now read these rows, and a
-- client receiving mail labelled that way reads as internal mail leaking out.
--
-- Only rows still carrying the exact seeded default are touched. If someone
-- has already edited the eyebrow, theirs is left alone rather than being
-- overwritten by a migration they did not ask for.

UPDATE hq_email_templates
   SET eyebrow = 'Your Pinnacle relationship',
       updated_at = datetime('now')
 WHERE slug LIKE 'notify\_%' ESCAPE '\'
   AND eyebrow = 'Pinnacle HQ notification'
   AND substr(slug, 8) IN (
     SELECT event_key FROM notification_event_catalog WHERE audience = 'client'
   );
