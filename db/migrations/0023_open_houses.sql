-- Open house events, synced from the SmartMLS OpenHouse resource.
--
-- /open-houses used to query RETS on every page request: a login, then a
-- per-listing lookup for each event that fell back to RETS again when the
-- listing was not already in Neon. That is minutes of work inside a serverless
-- function with seconds to spend, which is why the page shipped and then
-- answered 502 whenever the MLS was slow. The events live here now and the page
-- joins them to `listings` in SQL.
--
-- Rows are scoped to a rolling window (today .. +6 days ET). The sync replaces
-- that window wholesale so a cancelled open house disappears, and never prunes
-- unless the RETS pull actually succeeded — an empty result from a failed query
-- must not empty the table.

CREATE TABLE IF NOT EXISTS open_houses (
  -- OHKey / OHID when SmartMLS supplies one, else listing+date.
  id             text PRIMARY KEY,
  -- Property.listing_key. Present on most events; not guaranteed.
  listing_key    text,
  -- Property.mls_id (SmartMLS calls it OHListingId). The usual join key.
  listing_id     text,
  oh_date        date        NOT NULL,
  -- MLS sends naive local datetimes. Kept as text so nothing re-zones them:
  -- an 11am open house is 11am in Connecticut, not 11am UTC.
  start_datetime text,
  end_datetime   text,
  oh_type        text,
  comment        text,
  synced_at      timestamptz NOT NULL DEFAULT now()
);

-- The page always asks for a date window.
CREATE INDEX IF NOT EXISTS idx_open_houses_date
  ON open_houses (oh_date);

-- Join paths to listings.
CREATE INDEX IF NOT EXISTS idx_open_houses_listing_id
  ON open_houses (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_open_houses_listing_key
  ON open_houses (listing_key) WHERE listing_key IS NOT NULL;
