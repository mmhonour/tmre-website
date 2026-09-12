-- ============================================================================
-- Migration 0034 — contact / List With Me inquiries (serverless-durable)
-- ----------------------------------------------------------------------------
-- Replaces gitignored data/contacts.json, which cannot persist on Netlify
-- Functions (POST /api/contact 500s). Idempotent: safe to re-run.
-- ensureContactsTable() creates the same table on first request.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contacts (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL,
  phone          text,
  source         text NOT NULL DEFAULT 'nav-contact',
  listing_info   text,
  address        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_created_at
  ON contacts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_email
  ON contacts (email);

CREATE INDEX IF NOT EXISTS idx_contacts_source
  ON contacts (source);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0034_contacts', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
