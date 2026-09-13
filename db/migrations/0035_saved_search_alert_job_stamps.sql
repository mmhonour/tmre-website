-- ============================================================================
-- Migration 0035 — listing vs open-house notify stamps
-- ----------------------------------------------------------------------------
-- Incremental owns listing mail; the open-houses job owns OH mail. Cadence
-- (daily/weekly) must not share one last_notified_at or one job's send skips
-- the other for the rest of the day. Idempotent: ensureSavedSearchAlertTables
-- does the same ALTER + backfill.
-- ============================================================================

BEGIN;

ALTER TABLE saved_search_alerts
  ADD COLUMN IF NOT EXISTS last_listing_notified_at timestamptz;

ALTER TABLE saved_search_alerts
  ADD COLUMN IF NOT EXISTS last_open_house_notified_at timestamptz;

UPDATE saved_search_alerts
   SET last_listing_notified_at = last_notified_at
 WHERE last_listing_notified_at IS NULL
   AND last_notified_at IS NOT NULL;

UPDATE saved_search_alerts
   SET last_open_house_notified_at = last_notified_at
 WHERE last_open_house_notified_at IS NULL
   AND last_notified_at IS NOT NULL;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0035_saved_search_alert_job_stamps', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
