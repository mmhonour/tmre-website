-- ============================================================================
-- Migration 0023 — listing_land_premiums (sold PPSF on a 1/4-mile land stretch)
-- ============================================================================
-- Per-listing corridor vs town-median land read. Not a town stats_cache row.
-- Netlify may not run this; the app also CREATE TABLE IF NOT EXISTS on use.

BEGIN;

CREATE TABLE IF NOT EXISTS listing_land_premiums (
  listing_id text PRIMARY KEY,
  algo_version integer NOT NULL,
  axis text,
  sold_count integer NOT NULL DEFAULT 0,
  stretch_median_ppsf numeric,
  city_median_ppsf numeric,
  listing_ppsf numeric,
  stretch_premium_pct numeric,
  listing_premium_pct numeric,
  explains_land boolean NOT NULL DEFAULT false,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL
);

INSERT INTO schema_migrations (version) VALUES ('0023')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
