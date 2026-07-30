-- ============================================================================
-- Migration 0012 — durable per-content view counts
-- ----------------------------------------------------------------------------
-- `visitors.pages` keeps only the last 50 hits per visitor, so it cannot carry
-- a running total. One row per (content, visitor) gives both totals and
-- distinct viewers on read, and survives the trim. Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS content_views (
  content_key      text NOT NULL,          -- 'listing:24192179' | 'page:/stats'
  vid              text NOT NULL,
  kind             text NOT NULL,          -- 'listing' | 'page'
  mls_id           text,                   -- set when kind = 'listing'
  path             text NOT NULL,          -- canonical path for the content
  views            integer NOT NULL DEFAULT 0,
  first_viewed_at  timestamptz NOT NULL DEFAULT now(),
  last_viewed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_key, vid)
);

CREATE INDEX IF NOT EXISTS idx_content_views_kind
  ON content_views (kind);

CREATE INDEX IF NOT EXISTS idx_content_views_vid
  ON content_views (vid);

CREATE INDEX IF NOT EXISTS idx_content_views_last_viewed
  ON content_views (last_viewed_at DESC);

-- Seed from the page history already on hand. Only listing paths and plain
-- pages can be recovered: spotlight views were logged without the ?property=
-- param that identifies the property, so they seed as plain /spotlight hits.
INSERT INTO content_views (
  content_key, vid, kind, mls_id, path, views, first_viewed_at, last_viewed_at
)
SELECT
  CASE WHEN mls IS NOT NULL THEN 'listing:' || mls ELSE 'page:' || pathname END,
  vid,
  CASE WHEN mls IS NOT NULL THEN 'listing' ELSE 'page' END,
  mls,
  CASE WHEN mls IS NOT NULL THEN '/listings/' || mls ELSE pathname END,
  count(*),
  min(viewed_at),
  max(viewed_at)
FROM (
  SELECT
    v.vid,
    COALESCE(NULLIF(rtrim(split_part(hit ->> 'path', '?', 1), '/'), ''), '/') AS pathname,
    substring(split_part(hit ->> 'path', '?', 1) FROM '^/listings/([^/]+)') AS mls,
    (hit ->> 'at')::timestamptz AS viewed_at
  FROM visitors v
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(v.pages) = 'array' THEN v.pages ELSE '[]'::jsonb END
  ) AS hit
  WHERE hit ->> 'path' LIKE '/%'
    AND hit ->> 'at' ~ '^\d{4}-\d{2}-\d{2}'
) hits
GROUP BY 1, 2, 3, 4, 5
ON CONFLICT (content_key, vid) DO NOTHING;

INSERT INTO schema_migrations (version, applied_at)
VALUES ('0012_content_views', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
