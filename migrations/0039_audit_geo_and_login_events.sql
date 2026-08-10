-- Add coarse geo columns to audit_log so the Audit Log Center and the
-- notification bell can show "signed in from X" without an extra join.
-- Values populated from Cloudflare's request.cf metadata at write time
-- (city / region / country) plus IP; kept nullable because local dev and
-- some proxies do not expose that data.
ALTER TABLE audit_log ADD COLUMN actor_city TEXT;
ALTER TABLE audit_log ADD COLUMN actor_region TEXT;
ALTER TABLE audit_log ADD COLUMN actor_country TEXT;
