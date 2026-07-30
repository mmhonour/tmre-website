-- ============================================================================
-- Migration 0011 — Monday brief / home CTA leads (serverless-durable)
-- ----------------------------------------------------------------------------
-- Replaces gitignored data/leads.json, which cannot persist on Netlify
-- Functions. Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS leads (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL,
  phone          text,
  zip            text NOT NULL,
  town           text,
  audience_type  text NOT NULL,
  source         text NOT NULL DEFAULT 'website',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_email
  ON leads (email);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0011_leads', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
