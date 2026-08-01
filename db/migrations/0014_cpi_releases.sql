-- ============================================================================
-- Migration 0014 — CPI releases synced from bls.gov news releases
-- ----------------------------------------------------------------------------
-- Seed calendar stays in lib/cpi-calendar.ts + lib/cpi-history.ts. Sync overlays
-- MoM/YoY/core prints and a short summary scraped from the official BLS release
-- (not AI-generated). Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cpi_releases (
  id              text PRIMARY KEY,          -- e.g. '2025-07'
  reference_month text NOT NULL,             -- YYYY-MM
  release_date    text NOT NULL,             -- YYYY-MM-DD
  release_time_et text NOT NULL DEFAULT '8:30 a.m. ET',
  mom_pct         numeric,
  yoy_pct         numeric,
  core_mom_pct    numeric,
  core_yoy_pct    numeric,
  release_url     text,
  note            text,
  /** Lead paragraphs from the official BLS CPI news release. */
  summary         text,
  /** First body paragraph. */
  excerpt         text,
  /** JSON array of category/driver highlights. */
  highlights_json text,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpi_releases_release_date
  ON cpi_releases (release_date DESC);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0014_cpi_releases', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
