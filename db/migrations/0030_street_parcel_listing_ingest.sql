ALTER TABLE vision_street_parcels
  ADD COLUMN IF NOT EXISTS listing_ingest_at timestamptz;
