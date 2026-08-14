-- ============================================================================
-- Migration 0021 — vision_addresses.field_card jsonb (parsed Field Card)
-- ============================================================================

BEGIN;

ALTER TABLE vision_addresses
  ADD COLUMN IF NOT EXISTS field_card jsonb;

CREATE INDEX IF NOT EXISTS idx_vision_addr_field_card_gin
  ON vision_addresses USING gin (field_card);

CREATE INDEX IF NOT EXISTS idx_vision_addr_field_card_search
  ON vision_addresses
  USING gin (to_tsvector('simple', coalesce(field_card->>'searchText', '')));

INSERT INTO schema_migrations (version) VALUES ('0021')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
