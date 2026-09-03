-- House numbers / parcel labels per official VGSI street.
--
-- The Vision crawler already fetches Streets.aspx?Name=… to walk parcels.
-- Those address lines (5 Locust Ln, 6 Locust Ln, …) used to live only in
-- that HTML. This table is that street page, persisted.
--
-- Street-scoped replace: a cancelled house on Locust Ln disappears the next
-- time that street page is fetched. A fault on Locust Ln cannot empty Main St.

CREATE TABLE IF NOT EXISTS vision_street_parcels (
  town          text        NOT NULL,
  street_name   text        NOT NULL,
  vision_pid    text        NOT NULL,
  address_label text        NOT NULL,
  source_url    text        NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (town, street_name, vision_pid)
);

CREATE INDEX IF NOT EXISTS idx_vision_street_parcels_town_street
  ON vision_street_parcels (town, street_name);
