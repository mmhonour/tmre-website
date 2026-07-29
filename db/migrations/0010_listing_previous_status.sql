-- ============================================================================
-- Migration 0010 — listing previous MLS status
-- ----------------------------------------------------------------------------
-- Records the MLS status a listing held before its current one, so the Latest
-- feed can tell a genuine "Back on Market" (Under Contract → Active) apart from
-- a routine modification. Written by the sync upsert from the pre-conflict row,
-- so only transitions observed after this ships are captured.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS previous_mls_status text;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS previous_status_changed_at timestamptz;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0010_listing_previous_status', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
