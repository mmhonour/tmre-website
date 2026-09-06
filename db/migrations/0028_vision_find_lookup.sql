-- ============================================================================
-- Migration 0028 — Find assessor-style lookup indexes
-- ----------------------------------------------------------------------------
-- /find now matches owner_name, owner_mailing_address, MBLU, PID, and address.
-- Trigram GIN so `%name%` / `%street%` stays indexed (same pattern as 0007).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_vision_addr_owner_trgm
  ON vision_addresses USING gin (lower(owner_name) gin_trgm_ops)
  WHERE owner_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vision_addr_mailing_trgm
  ON vision_addresses USING gin (lower(owner_mailing_address) gin_trgm_ops)
  WHERE owner_mailing_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vision_addr_address_full_trgm
  ON vision_addresses USING gin (lower(address_full) gin_trgm_ops)
  WHERE address_full IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0028')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
