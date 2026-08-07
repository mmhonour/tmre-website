-- ============================================================================
-- Migration 0018 — PTA people: last_name/first_name replace name (column order)
-- ----------------------------------------------------------------------------
-- Rebuilds people so last_name + first_name sit where name was, then drops name.
-- Idempotent: safe to re-run if name is already gone.
-- ============================================================================

BEGIN;

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS first_name text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'people'
       AND column_name = 'name'
  ) THEN
    UPDATE people
       SET last_name = NULLIF(btrim(split_part(name, ',', 1)), ''),
           first_name = NULLIF(
             btrim(substring(name from position(',' in name) + 1)),
             ''
           )
     WHERE (last_name IS NULL OR first_name IS NULL)
       AND position(',' in name) > 0;

    UPDATE people
       SET last_name = NULLIF(btrim(name), '')
     WHERE last_name IS NULL
       AND position(',' in name) = 0;
  END IF;
END $$;

UPDATE people
   SET last_name = COALESCE(NULLIF(btrim(last_name), ''), '(unknown)')
 WHERE last_name IS NULL OR btrim(last_name) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'people'
       AND column_name = 'name'
  ) THEN
    CREATE TABLE people__new (
      id            text PRIMARY KEY,
      household_id  text NOT NULL REFERENCES khe_pta_households (id) ON DELETE CASCADE,
      kind          text NOT NULL CHECK (kind IN ('parent', 'student')),
      last_name     text NOT NULL,
      first_name    text,
      email         text,
      phone         text,
      address       text,
      grade         text,
      school        text,
      grad_year     integer,
      teacher       text,
      nickname      text,
      sort_order    integer NOT NULL DEFAULT 0,
      imported_at   timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO people__new (
      id, household_id, kind, last_name, first_name,
      email, phone, address, grade, school, grad_year,
      teacher, nickname, sort_order, imported_at
    )
    SELECT
      id, household_id, kind, last_name, first_name,
      email, phone, address, grade, school, grad_year,
      teacher, nickname, sort_order, imported_at
    FROM people;

    DROP TABLE people;
    ALTER TABLE people__new RENAME TO people;

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
  END IF;
END $$;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0018_khe_pta_drop_name', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
