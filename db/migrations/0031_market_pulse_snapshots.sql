-- Weekly Market Pulse / Monday brief archive.
--
-- stats_cache is current market math and is overwritten on every rebuild.
-- WoW / MoM / YoY need last Monday to still be there. One row per brief slot
-- (Eastern send-day). Netlify may not run this; the app also ensures the table.

BEGIN;

CREATE TABLE IF NOT EXISTS market_pulse_snapshots (
  slot_date    date PRIMARY KEY,
  generated_at timestamptz NOT NULL,
  sent_at      timestamptz,
  source       text NOT NULL,
  payload      jsonb NOT NULL,
  stored_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_pulse_snapshots_stored_at
  ON market_pulse_snapshots (stored_at DESC);

INSERT INTO schema_migrations (version) VALUES ('0031')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
