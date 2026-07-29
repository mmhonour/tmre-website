-- ============================================================================
-- Migration 0009 — CT county / town coverage catalog
-- ----------------------------------------------------------------------------
-- Master list of Connecticut counties + municipalities for future site-wide
-- coverage activation. Admin toggles `ct_towns.active`; pages still use
-- hardcoded TMRE_TOWNS until a later wiring pass.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ct_counties (
  id          text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ct_towns (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  county_id       text NOT NULL REFERENCES ct_counties (id) ON DELETE RESTRICT,
  active          boolean NOT NULL DEFAULT false,
  mls_city_code   text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (county_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ct_towns_county_id
  ON ct_towns (county_id);

CREATE INDEX IF NOT EXISTS idx_ct_towns_active
  ON ct_towns (active)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_ct_towns_name_lower
  ON ct_towns (lower(name));

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0009_ct_coverage_towns', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
