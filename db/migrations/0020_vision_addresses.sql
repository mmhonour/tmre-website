-- ============================================================================
-- Migration 0020 — vision_addresses (VGSI cadastral index) + listings.vision_pid
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS vision_addresses (
  town                     text NOT NULL,
  vision_pid               text NOT NULL,
  account_number           text,
  mblu                     text,
  use_code                 text,
  use_code_description     text,
  address_full             text,
  address_norm             text,
  street_no                text,
  street_name              text,
  city                     text,
  state                    text,
  zip                      text,
  owner_name               text,
  assessed_value           integer,
  appraisal_value          integer,
  building_count           integer,
  year_built               integer,
  living_area_sqft         integer,
  beds                     integer,
  full_baths               integer,
  half_baths               integer,
  total_rooms              integer,
  style                    text,
  model                    text,
  acres                    double precision,
  zoning                   text,
  last_sale_price          integer,
  last_sale_date           text,
  last_sale_book_page      text,
  photo_url                text,
  parcel_url               text NOT NULL,
  field_card_r2_key        text,
  field_card_content_type  text,
  field_card_scraped_at    timestamptz,
  listing_id               text,
  mls_id                   text,
  content_fingerprint      text,
  source_host              text NOT NULL,
  scraped_at               timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL,
  PRIMARY KEY (town, vision_pid)
);

CREATE INDEX IF NOT EXISTS idx_vision_addr_town_norm
  ON vision_addresses (town, address_norm)
  WHERE address_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vision_addr_mblu
  ON vision_addresses (town, mblu)
  WHERE mblu IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vision_addr_listing_id
  ON vision_addresses (listing_id)
  WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vision_addr_scraped
  ON vision_addresses (town, scraped_at DESC);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS vision_pid text;

CREATE INDEX IF NOT EXISTS idx_listings_vision_pid
  ON listings (vision_pid)
  WHERE vision_pid IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0020')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
