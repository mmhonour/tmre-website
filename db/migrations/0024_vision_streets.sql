-- Official VGSI street index per town (Streets.aspx?Letter=A…).
--
-- The Vision crawler already fetches each letter page to walk parcels.
-- Those names used to live only in crawl state and then disappear.
-- This table is that letter page, persisted: one row per town + street name.
--
-- A letter is replaced wholesale when that letter page is fetched successfully.
-- A failed fetch must not clear the letter. Other letters are left alone.

CREATE TABLE IF NOT EXISTS vision_streets (
  town        text        NOT NULL,
  street_name text        NOT NULL,
  -- VGSI letter bucket we fetched (A–Y in the current crawler; not derived
  -- from the name, in case Vision’s index and the spelling disagree).
  letter      text        NOT NULL,
  source_url  text        NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (town, street_name)
);

CREATE INDEX IF NOT EXISTS idx_vision_streets_town_letter
  ON vision_streets (town, letter);
