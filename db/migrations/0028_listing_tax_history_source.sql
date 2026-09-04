-- Provenance for listing_tax_history rows.
--
-- Until now every row came from the MLS feed's PropertyTax/TaxYear pair, which
-- only ever carries the current fiscal year — the other four UI slots render
-- null. Historical years are computed from the CT Parcel & CAMA extracts times
-- the town mill rate, so a row's amount is no longer self-explanatory: `source`
-- says which pipeline wrote it, and the assessment/mill columns record the two
-- inputs so a figure can be audited (or recomputed) years later without
-- re-fetching the state datasets.
--
-- `assessment_carried_forward` marks an amount whose assessment was inherited
-- from an earlier grand list year rather than observed in that year's extract.
-- That is legitimate — CT assessments are frozen between revaluations — but it
-- is a weaker claim than an observed value and callers may want to say so.

ALTER TABLE listing_tax_history
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mls',
  ADD COLUMN IF NOT EXISTS town text,
  ADD COLUMN IF NOT EXISTS assessed_value numeric,
  ADD COLUMN IF NOT EXISTS assessment_year integer,
  ADD COLUMN IF NOT EXISTS assessment_carried_forward boolean,
  ADD COLUMN IF NOT EXISTS mill_rate numeric;

-- Coverage reporting: "which towns and years are filled, and by whom".
CREATE INDEX IF NOT EXISTS idx_listing_tax_history_town_year
  ON listing_tax_history (town, tax_year_end DESC)
  WHERE town IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listing_tax_history_source
  ON listing_tax_history (source);
