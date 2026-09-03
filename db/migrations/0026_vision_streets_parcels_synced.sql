-- Mark a street as house-list fetched even when Streets.aspx?Name= returns
-- zero parcels, so fillMissingVisionStreetParcels cannot loop forever.
ALTER TABLE vision_streets
  ADD COLUMN IF NOT EXISTS parcels_synced_at timestamptz;
