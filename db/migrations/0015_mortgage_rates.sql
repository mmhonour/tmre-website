-- ============================================================================
-- Migration 0015 — mortgage rate observations synced from FRED
-- ----------------------------------------------------------------------------
-- One row per (series_id, obs_date). Series catalog lives in
-- lib/mortgage-rates-shared.ts (Freddie Mac PMMS 30/15-yr, Optimal Blue
-- conforming vs jumbo, 10-yr Treasury). Powers /mortgage-rates.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS mortgage_rates (
  series_id  text NOT NULL,               -- FRED series id, e.g. 'MORTGAGE30US'
  obs_date   date NOT NULL,               -- observation date
  value      numeric NOT NULL,            -- percent, e.g. 6.72
  synced_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, obs_date)
);

CREATE INDEX IF NOT EXISTS idx_mortgage_rates_series_date
  ON mortgage_rates (series_id, obs_date DESC);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0015_mortgage_rates', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
