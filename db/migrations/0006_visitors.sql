-- ============================================================================
-- Migration 0006 — website visitor activity log (serverless-durable)
-- ----------------------------------------------------------------------------
-- Replaces gitignored data/visitors.json, which cannot persist on Netlify
-- Functions (/tmp / deploy FS). One row per cookie vid; pages kept as jsonb.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS visitors (
  vid            text PRIMARY KEY,
  first_seen     timestamptz NOT NULL,
  last_seen      timestamptz NOT NULL,
  pageviews      integer NOT NULL DEFAULT 1,
  ip             text,
  geo            jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages          jsonb NOT NULL DEFAULT '[]'::jsonb,
  email          text,
  zip            text,
  name           text,
  audience_type  text,
  lead_id        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen
  ON visitors (last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_visitors_email
  ON visitors (email)
  WHERE email IS NOT NULL;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0006_visitors', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
