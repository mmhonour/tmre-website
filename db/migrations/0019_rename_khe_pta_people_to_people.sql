-- ============================================================================
-- Migration 0019 — rename khe_pta_people → people (legacy catch-up)
-- ----------------------------------------------------------------------------
-- 0016 already renames when possible; this catches DBs that still have the
-- old table name. Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  has_legacy boolean;
  has_people boolean;
  people_empty boolean := true;
  legacy_empty boolean := true;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'khe_pta_people'
  ) INTO has_legacy;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'people'
  ) INTO has_people;

  IF has_legacy AND NOT has_people THEN
    ALTER TABLE khe_pta_people RENAME TO people;
  ELSIF has_legacy AND has_people THEN
    EXECUTE 'SELECT NOT EXISTS (SELECT 1 FROM people LIMIT 1)' INTO people_empty;
    EXECUTE 'SELECT NOT EXISTS (SELECT 1 FROM khe_pta_people LIMIT 1)' INTO legacy_empty;
    IF people_empty AND NOT legacy_empty THEN
      -- Empty people twin from a partial migrate; keep the populated legacy table.
      DROP TABLE people;
      ALTER TABLE khe_pta_people RENAME TO people;
    END IF;
  END IF;
END $$;

-- Drop legacy index names when idx_people_* already exists (0016 creates those).
DROP INDEX IF EXISTS idx_khe_pta_people_household;
DROP INDEX IF EXISTS idx_khe_pta_people_kind_grade;
DROP INDEX IF EXISTS idx_khe_pta_people_grad_year;
DROP INDEX IF EXISTS idx_khe_pta_people_email;
DROP INDEX IF EXISTS idx_khe_pta_people_last_first;

CREATE INDEX IF NOT EXISTS idx_people_household ON people (household_id);
CREATE INDEX IF NOT EXISTS idx_people_kind_grade ON people (kind, grade);
CREATE INDEX IF NOT EXISTS idx_people_grad_year ON people (grad_year) WHERE kind = 'student';
CREATE INDEX IF NOT EXISTS idx_people_email ON people (lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_people_last_first ON people (lower(last_name), lower(first_name));

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0019_rename_khe_pta_people_to_people', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
