-- ============================================================================
-- Migration 0013 — FOMC meetings synced from federalreserve.gov
-- ----------------------------------------------------------------------------
-- Seed calendar stays in lib/fed-fomc-calendar.ts. Sync overlays decision facts
-- and a short summary scraped from the official statement (not AI-generated).
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fomc_meetings (
  id                 text PRIMARY KEY,          -- e.g. '2026-07'
  start_date         text NOT NULL,             -- YYYY-MM-DD
  end_date           text NOT NULL,
  has_sep            boolean NOT NULL DEFAULT false,
  decision           text,                      -- cut | hold | hike
  basis_points       integer,
  target_range_low   numeric,
  target_range_high  numeric,
  statement_url      text,
  note               text,
  /** First substantive paragraph(s) from the official statement. */
  summary            text,
  /** Shorter lead excerpt (usually paragraph 1). */
  excerpt            text,
  /** Voting for / against line(s) when present. */
  vote_note          text,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fomc_meetings_end_date
  ON fomc_meetings (end_date DESC);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0013_fomc_meetings', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
