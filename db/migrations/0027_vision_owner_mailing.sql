-- ============================================================================
-- Migration 0027 — vision_addresses.owner_mailing_address
-- ----------------------------------------------------------------------------
-- VGSI Owner address (lblAddr1 + lblAddr2). Already in field_card jsonb;
-- this typed column is for the parcel-page summary and reuse elsewhere.
-- ============================================================================

BEGIN;

ALTER TABLE vision_addresses
  ADD COLUMN IF NOT EXISTS owner_mailing_address text;

INSERT INTO schema_migrations (version) VALUES ('0027')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
