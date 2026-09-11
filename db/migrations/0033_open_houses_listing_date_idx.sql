-- Composite listing + date indexes for open-house history counts.
-- The page only lists homes with an OH today or later; past rows are
-- documentation (Most / First / relist) looked up by listing token.
-- Netlify does not run migrations — ensureOpenHousesTable() creates the
-- same indexes on first request.

CREATE INDEX IF NOT EXISTS idx_open_houses_listing_id_date
  ON open_houses (listing_id, oh_date) WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_open_houses_listing_key_date
  ON open_houses (listing_key, oh_date) WHERE listing_key IS NOT NULL;
