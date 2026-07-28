-- ============================================================================
-- Migration 0008 — passwordless end-user accounts (magic link)
-- ----------------------------------------------------------------------------
-- Email-only identity for visitors who choose to sign in. No passwords.
-- Links optional visitor cookie (tmre_vid) and powers alert / interest prefills.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS site_users (
  id              text PRIMARY KEY,
  email           text NOT NULL UNIQUE,
  name            text,
  visitor_id      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_users_visitor_id
  ON site_users (visitor_id)
  WHERE visitor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_user_magic_links (
  token_hash      text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES site_users (id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_user_magic_links_user
  ON site_user_magic_links (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_user_sessions (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES site_users (id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_user_sessions_user
  ON site_user_sessions (user_id);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0008_site_users', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
