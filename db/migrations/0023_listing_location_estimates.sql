-- ============================================================================
-- Migration 0023 — location estimates (coastal areas / town centers)
-- ============================================================================
-- Per-listing current row + snapshots for a later estimates time series.
-- Not town market-stats. Netlify may not run this; the app also ensures tables.

BEGIN;

CREATE TABLE IF NOT EXISTS listing_location_estimates (
  listing_id text PRIMARY KEY,
  algo_version integer NOT NULL,
  kind text,
  sold_count integer NOT NULL DEFAULT 0,
  sold_median_ppsf numeric,
  city_median_ppsf numeric,
  listing_ppsf numeric,
  sold_premium_pct numeric,
  listing_premium_pct numeric,
  explains_location boolean NOT NULL DEFAULT false,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_location_estimate_snapshots (
  listing_id text NOT NULL,
  computed_at timestamptz NOT NULL,
  algo_version integer NOT NULL,
  kind text,
  sold_count integer NOT NULL DEFAULT 0,
  sold_median_ppsf numeric,
  city_median_ppsf numeric,
  listing_ppsf numeric,
  sold_premium_pct numeric,
  listing_premium_pct numeric,
  explains_location boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (listing_id, computed_at)
);

INSERT INTO schema_migrations (version) VALUES ('0023')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
