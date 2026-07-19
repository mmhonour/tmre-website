-- ============================================================================
-- Migration 0004 — visitor saved-search alerts (email digests / immediate)
-- ----------------------------------------------------------------------------
-- Criteria JSON mirrors lib/visitor-search-profile.ts VisitorSearchCriteria.
-- Deliveries table prevents re-notifying the same listing for an alert.
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS saved_search_alerts (
  id                   text PRIMARY KEY,
  visitor_id           text,
  criteria             jsonb NOT NULL,
  criteria_fingerprint text NOT NULL,
  criteria_label       text NOT NULL,
  channel              text NOT NULL CHECK (channel IN ('email', 'sms')),
  email                text,
  phone                text,
  cadence              text NOT NULL CHECK (cadence IN ('immediate', 'daily', 'weekly')),
  daily_time_et        text,
  weekly_day           smallint CHECK (weekly_day IS NULL OR (weekly_day >= 0 AND weekly_day <= 6)),
  weekly_time_et       text,
  active               boolean NOT NULL DEFAULT true,
  last_notified_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_search_alerts_contact_chk CHECK (
    (channel = 'email' AND email IS NOT NULL) OR
    (channel = 'sms' AND phone IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_saved_search_alerts_active_cadence
  ON saved_search_alerts (active, cadence)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_saved_search_alerts_visitor
  ON saved_search_alerts (visitor_id)
  WHERE visitor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_search_alert_deliveries (
  alert_id   text NOT NULL REFERENCES saved_search_alerts(id) ON DELETE CASCADE,
  listing_id text NOT NULL,
  channel    text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_search_alert_deliveries_sent
  ON saved_search_alert_deliveries (sent_at DESC);

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0004_saved_search_alerts', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
