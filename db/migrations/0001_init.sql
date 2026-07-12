-- ============================================================================
-- Migration 0001 — initial Neon Postgres schema
-- ----------------------------------------------------------------------------
-- Replaces the SQLite-on-Netlify-Blobs listings store.
--
-- Design principles (see db/README.md for full rationale):
--   * Typed, indexed columns for every field that is filtered / sorted /
--     range-compared / grouped in SQL or in the comparables + stats + scoring
--     code (beds ±1, baths ±1, lot ±40%, vintage bucket, zip equality,
--     price/DOM/close-date sort & windows).
--   * `data jsonb`  — the normalized Listing object WITHOUT `raw`, used to
--     hydrate the app's `Listing` type on read (mirrors SQLite's `data` TEXT).
--   * `raw jsonb`   — the full RETS payload (catch-all). New MLS fields never
--     require a schema migration. GIN indexing on `raw` is deliberately NOT
--     enabled yet — B-tree on typed columns covers every current query. Add a
--     GIN index only when a containment / full-text pattern actually appears
--     (see the commented "future" section at the bottom of this file).
--   * Timestamps promoted to `timestamptz` so date-window filters (closed since
--     2024, 7-day, 8-month rental window) run in SQL. The original ISO strings
--     also survive inside `data` for exact-fidelity hydration.
--
-- Idempotent: safe to re-run. Wrapped in a single transaction.
-- Photos are intentionally OUT OF SCOPE — binary photo data stays in its
-- existing object store (Netlify Blobs / listing-photos cache), not Postgres.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- listings — primary MLS mirror
--   PK `id` = listingKey || mlsId (see lib/listings-db.ts listingRowId()).
--   status_bucket ∈ {'Active','Closed','Expired'} (lib/listings-store.ts).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id                       text PRIMARY KEY,
  mls_id                   text NOT NULL,
  listing_key              text,

  -- classification / filtering
  town                     text NOT NULL,
  status_bucket            text NOT NULL,
  mls_status               text,
  property_type            text,
  style                    text,

  -- address (promoted subset; full address kept in `data`)
  postal_code              text,
  address_city             text,
  address_street           text,
  address_full             text,

  -- numeric filter / sort / range-compare
  price                    numeric,
  original_list_price      numeric,
  close_price              numeric,          -- parsed at ingest (raw ClosePrice/SoldPrice/…)
  beds                     numeric,          -- numeric: some feeds emit fractional
  baths                    numeric,          -- numeric: half-baths (2.5)
  sqft                     integer,
  lot_acres                double precision,
  year_built               integer,
  dom                      integer,
  property_tax             numeric,
  property_tax_year        text,
  photo_count              integer,

  -- geo (see db/README.md — stored now, spatial index deferred)
  latitude                 double precision,
  longitude                double precision,

  -- timestamps (parsed to timestamptz for SQL date-window filters)
  list_date                timestamptz,
  modification_timestamp   timestamptz,
  status_change_timestamp  timestamptz,
  price_change_timestamp   timestamptz,
  close_date               timestamptz,      -- derived from raw close fields at ingest

  -- Goldilocks score (kept inline, mirrors SQLite)
  goldilocks_score         double precision,
  goldilocks_breakdown     jsonb,
  goldilocks_scored_at     timestamptz,

  -- payloads
  data                     jsonb NOT NULL,   -- normalized Listing WITHOUT raw (hydration source)
  raw                      jsonb,            -- full RETS record (catch-all / future GIN target)
  synced_at                timestamptz NOT NULL DEFAULT now()
);

-- Lookups by MLS identity
CREATE INDEX IF NOT EXISTS idx_listings_mls_id
  ON listings (mls_id);
CREATE INDEX IF NOT EXISTS idx_listings_listing_key
  ON listings (listing_key)
  WHERE listing_key IS NOT NULL;

-- Primary town pool filter (town + status bucket)
CREATE INDEX IF NOT EXISTS idx_listings_town_status
  ON listings (town, status_bucket);

-- "Recent updates" feed: WHERE status_bucket = ? ORDER BY modification_timestamp DESC
CREATE INDEX IF NOT EXISTS idx_listings_status_modts
  ON listings (status_bucket, modification_timestamp DESC);

-- Deal-board / town read pool: ORDER BY price DESC within a town
CREATE INDEX IF NOT EXISTS idx_listings_town_price
  ON listings (town, price DESC);

-- Comparables lookup: zip equality + bucket, then bed/bath range scan
CREATE INDEX IF NOT EXISTS idx_listings_comps
  ON listings (postal_code, status_bucket, beds, baths);

-- Closed-inventory date windows (stats 2024+, 8-month rental, 7-day)
CREATE INDEX IF NOT EXISTS idx_listings_close_date
  ON listings (close_date)
  WHERE close_date IS NOT NULL;

-- Vintage bucket grouping (sales-by-vintage stats)
CREATE INDEX IF NOT EXISTS idx_listings_year_built
  ON listings (year_built)
  WHERE year_built IS NOT NULL;

-- ---------------------------------------------------------------------------
-- sync_meta — key/value control flags (refresh locks, lastGood, snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- ---------------------------------------------------------------------------
-- sync_runs — refresh history / audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_runs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at     timestamptz NOT NULL,
  finished_at    timestamptz,
  town           text,
  status_bucket  text,
  listings_count integer NOT NULL DEFAULT 0,
  ok             boolean NOT NULL DEFAULT true,
  error          text
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
  ON sync_runs (started_at DESC);

-- ---------------------------------------------------------------------------
-- stats_cache — precomputed payloads (intelligence board, stats, deal-of-day…)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stats_cache (
  cache_key   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  computed_at timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- listing_tax_history — annual property-tax rows keyed by parcel + year
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_tax_history (
  listing_id     text NOT NULL,
  parcel_number  text NOT NULL,
  tax_year_label text NOT NULL,
  tax_year_end   integer NOT NULL,
  amount         numeric NOT NULL,
  synced_at      timestamptz NOT NULL,
  PRIMARY KEY (parcel_number, tax_year_end)
);

CREATE INDEX IF NOT EXISTS idx_listing_tax_history_listing_id
  ON listing_tax_history (listing_id);

-- ---------------------------------------------------------------------------
-- listing_if_estimates — "Instant Figure" sale/rent estimates per listing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_if_estimates (
  listing_id        text PRIMARY KEY,
  sale_amount       numeric,
  sale_amount_low   numeric,
  sale_amount_high  numeric,
  sale_sold_count   integer NOT NULL DEFAULT 0,
  sale_active_count integer NOT NULL DEFAULT 0,
  rent_amount       numeric,
  rent_amount_low   numeric,
  rent_amount_high  numeric,
  rent_sold_count   integer NOT NULL DEFAULT 0,
  rent_active_count integer NOT NULL DEFAULT 0,
  computed_at       timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- listing_relations — ranked comparables / related listings per subject
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_relations (
  subject_id  text NOT NULL,
  related_id  text NOT NULL,
  relation    text NOT NULL,
  rank        integer NOT NULL,
  score       double precision,
  payload     jsonb NOT NULL,
  computed_at timestamptz NOT NULL,
  PRIMARY KEY (subject_id, relation, related_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_relations_subject
  ON listing_relations (subject_id, relation, rank);

-- ---------------------------------------------------------------------------
-- listing_edge_scores — edge score + breakdown per listing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_edge_scores (
  mls_id            text PRIMARY KEY,
  listing_id        text NOT NULL,
  edge_score        double precision NOT NULL,
  breakdown_json    jsonb NOT NULL,
  metadata_snapshot jsonb NOT NULL,
  computed_at       timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_edge_scores_listing_id
  ON listing_edge_scores (listing_id);

-- ---------------------------------------------------------------------------
-- listing_superlatives — per-listing superlative badges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_superlatives (
  listing_id       text PRIMARY KEY,
  mls_id           text NOT NULL,
  superlatives_json jsonb NOT NULL,
  computed_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_superlatives_mls_id
  ON listing_superlatives (mls_id);

-- ---------------------------------------------------------------------------
-- town_property_addresses — verified/enriched address catalog per town
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS town_property_addresses (
  property_key  text PRIMARY KEY,
  parcel_number text,
  town          text NOT NULL,
  street        text NOT NULL,
  unit          text,
  zip           text,
  address_full  text NOT NULL,
  address_norm  text NOT NULL,
  listing_id    text,
  mls_id        text,
  source        text NOT NULL,
  verified_at   timestamptz NOT NULL,
  synced_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tpa_town_norm
  ON town_property_addresses (town, address_norm);
CREATE INDEX IF NOT EXISTS idx_tpa_address_norm
  ON town_property_addresses (address_norm);
CREATE INDEX IF NOT EXISTS idx_tpa_parcel
  ON town_property_addresses (parcel_number)
  WHERE parcel_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpa_listing_id
  ON town_property_addresses (listing_id)
  WHERE listing_id IS NOT NULL;
-- Case-insensitive address search. SQLite used `address_full COLLATE NOCASE`;
-- Postgres equivalent is an expression index on lower(address_full). Queries
-- must filter/sort on lower(address_full) LIKE lower(:q) to use this index.
CREATE INDEX IF NOT EXISTS idx_tpa_search
  ON town_property_addresses (lower(address_full));

-- ---------------------------------------------------------------------------
-- Record this migration
-- ---------------------------------------------------------------------------
INSERT INTO schema_migrations (version) VALUES ('0001')
  ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================================
-- FUTURE (do NOT enable until a query pattern needs it — see README):
--
--   -- Containment queries on arbitrary RETS fields (raw @> '{"Fireplace":"1"}')
--   CREATE INDEX idx_listings_raw_gin ON listings USING gin (raw jsonb_path_ops);
--
--   -- Full-text search over public remarks:
--   ALTER TABLE listings
--     ADD COLUMN remarks_tsv tsvector
--     GENERATED ALWAYS AS (to_tsvector('english', coalesce(data->>'remarks',''))) STORED;
--   CREATE INDEX idx_listings_remarks_tsv ON listings USING gin (remarks_tsv);
--
--   -- Radius / geo search (requires PostGIS or point/box types + GiST):
--   -- CREATE EXTENSION IF NOT EXISTS postgis;
--   -- ALTER TABLE listings ADD COLUMN geog geography(Point,4326)
--   --   GENERATED ALWAYS AS (...) STORED;
--   -- CREATE INDEX idx_listings_geog ON listings USING gist (geog);
-- ============================================================================
