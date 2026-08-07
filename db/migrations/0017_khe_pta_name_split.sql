-- ============================================================================
-- Migration 0017 — split PTA people name into last_name + first_name
-- ----------------------------------------------------------------------------
-- Historical: older installs had a single `name` column. No-op when `name` is
-- already gone. Idempotent: safe to re-run.
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

CREATE INDEX IF NOT EXISTS idx_people_last_first
  ON people (lower(last_name), lower(first_name));

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0017_khe_pta_name_split', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
