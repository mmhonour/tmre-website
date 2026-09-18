-- ============================================================================
-- Migration 0036 — visitor ZIP + admin site-pass flag
-- ----------------------------------------------------------------------------
-- Header ZIP (and IP postal fallback) live on visitors.zip so Admin traffic
-- can group "where people are coming from". is_admin is set when the request
-- carries the site-password cookie (tmre_site_pass), so operator hits are
-- distinguishable from strangers. idx_visitors_ip lets /api/visitor-town
-- reuse visitors.geo instead of a second ipapi.co credit. Idempotent:
-- ensureVisitorsTable does the same ALTER + backfill.
-- ============================================================================

BEGIN;

ALTER TABLE visitors
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE visitors
   SET zip = geo->>'postal'
 WHERE zip IS NULL
   AND geo->>'postal' ~ '^\d{5}$';

CREATE INDEX IF NOT EXISTS idx_visitors_zip
  ON visitors (zip)
  WHERE zip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitors_is_admin
  ON visitors (is_admin)
  WHERE is_admin = true;

CREATE INDEX IF NOT EXISTS idx_visitors_ip
  ON visitors (ip)
  WHERE ip IS NOT NULL;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0036_visitor_zip_admin', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
