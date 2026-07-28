-- ============================================================================
-- Migration 0007 — fast Find / address search (pg_trgm)
-- ----------------------------------------------------------------------------
-- Listings already promote address_* columns; Find was scanning jsonb with
-- ILIKE (and often falling through to RETS). Add a generated search_text blob
-- + GIN trigram indexes so `%query%` stays indexed.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Denormalized lowercased haystack for address / MLS typeahead.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(
      trim(
        both FROM
          coalesce(mls_id, '') || ' ' ||
          coalesce(address_street, '') || ' ' ||
          coalesce(address_full, '') || ' ' ||
          coalesce(address_city, '') || ' ' ||
          coalesce(postal_code, '') || ' ' ||
          coalesce(property_type, '')
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_listings_search_text_trgm
  ON listings USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_status_search_text
  ON listings (status_bucket, search_text);

-- Property directory (assessor + MLS address book) used by /api/addresses/search.
CREATE INDEX IF NOT EXISTS idx_tpa_street_trgm
  ON town_property_addresses USING gin (lower(street) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tpa_address_full_trgm
  ON town_property_addresses USING gin (lower(address_full) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tpa_address_norm_trgm
  ON town_property_addresses USING gin (lower(address_norm) gin_trgm_ops);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0007_listing_address_search', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
