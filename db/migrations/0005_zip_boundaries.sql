-- ============================================================================
-- Migration 0005 — Census TIGERweb ZCTA rings for Intelligence / Latest maps
-- ----------------------------------------------------------------------------
-- Outer rings only (simplified for SVG map popovers). Synced monthly from
-- Census TIGERweb ArcGIS; served via GET /api/zip-boundaries.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS zip_boundaries (
  zip         text PRIMARY KEY,
  rings       jsonb NOT NULL,
  source      text NOT NULL DEFAULT 'tigerweb',
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zip_boundaries_fetched_at
  ON zip_boundaries (fetched_at);

COMMIT;
