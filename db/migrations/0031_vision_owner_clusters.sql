-- ============================================================================
-- Migration 0031 — Vision multi-home owner index
-- ----------------------------------------------------------------------------
-- vision_pid is the card, not the owner. Keys extracted from Field Card
-- owner / mailing / compiled deed lines fill a pid↔cluster lookup.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS vision_owner_keys (
  town           text NOT NULL,
  vision_pid     text NOT NULL,
  key_kind       text NOT NULL,
  key_norm       text NOT NULL,
  display_label  text NOT NULL,
  role           text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (town, vision_pid, key_kind, key_norm),
  FOREIGN KEY (town, vision_pid)
    REFERENCES vision_addresses (town, vision_pid)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vision_owner_keys_norm
  ON vision_owner_keys (key_kind, key_norm);

CREATE TABLE IF NOT EXISTS vision_owner_cluster_members (
  cluster_id     text NOT NULL,
  town           text NOT NULL,
  vision_pid     text NOT NULL,
  display_name   text,
  site_address   text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, town, vision_pid),
  FOREIGN KEY (town, vision_pid)
    REFERENCES vision_addresses (town, vision_pid)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vision_owner_cluster_pid
  ON vision_owner_cluster_members (town, vision_pid);

INSERT INTO schema_migrations (version) VALUES ('0031')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
