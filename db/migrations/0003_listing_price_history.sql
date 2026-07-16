-- ============================================================================
-- Migration 0003 — listing_price_history (forward-only change log)
-- ----------------------------------------------------------------------------
-- SmartMLS RETS only exposes a SINGLE most-recent timestamp per listing
-- (PriceChangeTimestamp / StatusChangeTimestamp) — the intermediate steps of a
-- price ladder are never retained in the feed and cannot be pulled
-- retroactively. The ONLY way to obtain a genuine multi-step timeline is to log
-- our own snapshots over time and diff each sync against the last known value.
--
-- This table is that log. On every sync (full or incremental) the write path
-- compares each incoming listing to the row currently stored in `listings` and
-- appends ONE row here whenever the price and/or MLS status actually changed.
-- Each row is a self-describing edge — "on observed_at, price went from
-- previous_price → price" — so a sequence of rows for one listing IS the ladder.
--
-- Forward-only: it accumulates true history from the deploy of this migration
-- onward. There is no backfill of the past (the feed doesn't have it).
--
-- Idempotent: safe to re-run. Wrapped in a single transaction.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- listing_price_history — one row per observed price/status change
--   listing_id = listingKey || mlsId (mirrors listings.id). mls_id kept too so
--   the ladder survives relistings under a new MLS number (chain by address via
--   the listings table when displaying).
--   change_kind ∈ {'price','status','price_status'}.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_price_history (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id      text NOT NULL,
  mls_id          text NOT NULL,
  town            text,
  status_bucket   text NOT NULL,
  mls_status      text,            -- MLS status AFTER the change
  price           numeric,         -- price AFTER the change
  previous_status text,            -- MLS status BEFORE the change
  previous_price  numeric,         -- price BEFORE the change
  change_kind     text NOT NULL,
  observed_at     timestamptz NOT NULL DEFAULT now()
);

-- Per-listing ladder read: WHERE listing_id = ? ORDER BY observed_at
CREATE INDEX IF NOT EXISTS idx_lph_listing
  ON listing_price_history (listing_id, observed_at DESC);

-- Cross-relisting read by MLS number
CREATE INDEX IF NOT EXISTS idx_lph_mls
  ON listing_price_history (mls_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- Record this migration
-- ---------------------------------------------------------------------------
INSERT INTO schema_migrations (version) VALUES ('0003')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
