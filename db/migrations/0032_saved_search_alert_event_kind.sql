-- ============================================================================
-- Migration 0032 — saved-search deliveries distinguish listing vs open house
-- ----------------------------------------------------------------------------
-- A new listing may not have an open house yet. When one is detected later,
-- we notify again without colliding with the listing-delivery primary key.
-- Idempotent: safe to re-run (ensureSavedSearchAlertTables does the same).
-- ============================================================================

BEGIN;

ALTER TABLE saved_search_alert_deliveries
  ADD COLUMN IF NOT EXISTS event_kind text NOT NULL DEFAULT 'listing';

ALTER TABLE saved_search_alert_deliveries
  DROP CONSTRAINT IF EXISTS saved_search_alert_deliveries_pkey;

ALTER TABLE saved_search_alert_deliveries
  ADD CONSTRAINT saved_search_alert_deliveries_pkey
  PRIMARY KEY (alert_id, listing_id, event_kind);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0032_saved_search_alert_event_kind', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
