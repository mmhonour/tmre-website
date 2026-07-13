-- ============================================================================
-- Migration 0002 — listing photo index (metadata only)
-- ----------------------------------------------------------------------------
-- Companion to the Cloudflare R2 object store for listing photos.
--
-- Photo BYTES live in R2 (keys: photos/{cacheId}/{photoIndex}); this table is
-- a lightweight INDEX so the app can answer "which photo indices exist / are
-- fresh / what's the first stored index / how many are cached" without listing
-- the bucket per request. It holds NO binary data — only per-photo metadata —
-- so it never contributes to Postgres egress the way blob rows would.
--
-- cache_id = listingKey || mlsId (same id the sync + proxy write/read under,
-- see lib/listing-photo-store.ts listingPhotoCacheId()).
--
-- This replaces the freshness/enumeration role previously served by the
-- SQLite listing_photos table, retiring the SQLite-file-on-Blobs pattern.
--
-- Idempotent: safe to re-run. Wrapped in a single transaction.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS listing_photo_index (
  cache_id      text        NOT NULL,
  photo_index   integer     NOT NULL,
  content_type  text        NOT NULL DEFAULT 'image/jpeg',
  byte_length   integer     NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cache_id, photo_index)
);

-- Enumeration / freshness queries filter by cache_id and order by photo_index.
CREATE INDEX IF NOT EXISTS idx_listing_photo_index_cache_id
  ON listing_photo_index (cache_id, photo_index);

-- Freshness sweeps compare synced_at against a cutoff.
CREATE INDEX IF NOT EXISTS idx_listing_photo_index_synced_at
  ON listing_photo_index (synced_at);

INSERT INTO schema_migrations (version)
VALUES ('0002_listing_photo_index')
ON CONFLICT (version) DO NOTHING;

COMMIT;
