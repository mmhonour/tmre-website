-- ============================================================================
-- Migration 0029 — one Find haystack (assessor-speed typeahead)
-- ----------------------------------------------------------------------------
-- /find typeahead was OR-ing LIKE across JSON + many columns. Same pattern as
-- listings.search_text (0007): one generated blob + one trigram GIN.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE vision_addresses
  ADD COLUMN IF NOT EXISTS lookup_text text
  GENERATED ALWAYS AS (
    lower(
      trim(
        both FROM
          coalesce(vision_pid, '') || ' ' ||
          coalesce(account_number, '') || ' ' ||
          coalesce(mblu, '') || ' ' ||
          replace(replace(coalesce(mblu, ''), '/', ''), ' ', '') || ' ' ||
          coalesce(address_full, '') || ' ' ||
          coalesce(address_norm, '') || ' ' ||
          coalesce(street_no, '') || ' ' ||
          coalesce(street_name, '') || ' ' ||
          coalesce(owner_name, '') || ' ' ||
          coalesce(owner_mailing_address, '')
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_vision_addr_lookup_trgm
  ON vision_addresses USING gin (lookup_text gin_trgm_ops);

INSERT INTO schema_migrations (version) VALUES ('0029')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
