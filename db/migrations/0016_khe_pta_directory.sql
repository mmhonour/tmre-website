-- ============================================================================
-- Migration 0016 — PTA directory (private): households + people
-- ----------------------------------------------------------------------------
-- Imported from Membership Toolkit scrape (not MLS). Households group parents
-- with their students so kids associate via household_id. School year for
-- grad_year is 2025/2026 (4th grade → HS class of 2034). Not exposed on the
-- public site — Admin/import only. Idempotent: safe to re-run.
--
-- Table is `people` (legacy name khe_pta_people is renamed here if present).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS khe_pta_households (
  id          text PRIMARY KEY,
  address     text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy rename before CREATE so data is kept and we do not make an empty twin.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'khe_pta_people'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'people'
  ) THEN
    ALTER TABLE khe_pta_people RENAME TO people;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS people (
  id            text PRIMARY KEY,
  household_id  text NOT NULL REFERENCES khe_pta_households (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('parent', 'student')),
  last_name     text NOT NULL,
  first_name    text,
  email         text,
  phone         text,
  address       text,
  grade         text,
  school        text,                 -- KHS / CMS for current students
  grad_year     integer,              -- HS graduating class (e.g. 2034)
  teacher       text,
  nickname      text,
  sort_order    integer NOT NULL DEFAULT 0,
  imported_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_people_household
  ON people (household_id);

CREATE INDEX IF NOT EXISTS idx_people_kind_grade
  ON people (kind, grade);

CREATE INDEX IF NOT EXISTS idx_people_grad_year
  ON people (grad_year)
  WHERE kind = 'student';

CREATE INDEX IF NOT EXISTS idx_people_email
  ON people (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_people_last_first
  ON people (lower(last_name), lower(first_name));

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0016_khe_pta_directory', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
