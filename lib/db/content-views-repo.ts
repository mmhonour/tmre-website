import 'server-only'

import { query } from '@/lib/db/postgres'
import {
  resolveViewedContent,
  type ContentViewKind,
  type ContentViewSummary,
} from '@/lib/content-views'

let ensured = false

/** Idempotent guard so a database without migration 0012 still records views. */
export async function ensureContentViewsTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS content_views (
      content_key      text NOT NULL,
      vid              text NOT NULL,
      kind             text NOT NULL,
      mls_id           text,
      path             text NOT NULL,
      views            integer NOT NULL DEFAULT 0,
      first_viewed_at  timestamptz NOT NULL DEFAULT now(),
      last_viewed_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (content_key, vid)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_content_views_kind ON content_views (kind)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_content_views_vid ON content_views (vid)`)
  await query(
    `CREATE INDEX IF NOT EXISTS idx_content_views_last_viewed ON content_views (last_viewed_at DESC)`,
  )
  ensured = true
}

/**
 * Credit one pageview to the property or page it resolves to. Called alongside
 * the visitor write; a failure here must never cost the pageview itself.
 */
export async function recordContentView(input: {
  vid: string
  path: string
  at: string
}): Promise<void> {
  const vid = input.vid.trim()
  if (!vid) return
  const content = resolveViewedContent(input.path)
  await ensureContentViewsTable()
  await query(
    `INSERT INTO content_views (
       content_key, vid, kind, mls_id, path, views, first_viewed_at, last_viewed_at
     ) VALUES ($1, $2, $3, $4, $5, 1, $6::timestamptz, $6::timestamptz)
     ON CONFLICT (content_key, vid) DO UPDATE SET
       views = content_views.views + 1,
       last_viewed_at = GREATEST(content_views.last_viewed_at, EXCLUDED.last_viewed_at),
       first_viewed_at = LEAST(content_views.first_viewed_at, EXCLUDED.first_viewed_at)`,
    [content.contentKey, vid, content.kind, content.mlsId, content.path, input.at],
  )
}

type AggregateRow = {
  content_key: string
  kind: string
  mls_id: string | null
  path: string
  views: string | number
  viewers: string | number
  first_viewed_at: Date | string
  last_viewed_at: Date | string
}

type ListingLabelRow = {
  mls_id: string
  address_street: string | null
  address_full: string | null
  town: string | null
  price: string | number | null
  mls_status: string | null
}

function tsToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0
  return typeof value === 'number' ? value : Number(value) || 0
}

function aggregateRowToSummary(row: AggregateRow): ContentViewSummary {
  return {
    contentKey: row.content_key,
    kind: row.kind === 'listing' ? 'listing' : 'page',
    mlsId: row.mls_id,
    path: row.path,
    views: toNumber(row.views),
    viewers: toNumber(row.viewers),
    firstViewedAt: tsToIso(row.first_viewed_at),
    lastViewedAt: tsToIso(row.last_viewed_at),
  }
}

const AGGREGATE_SELECT = `
  SELECT content_key,
         min(kind) AS kind,
         min(mls_id) AS mls_id,
         min(path) AS path,
         sum(views)::bigint AS views,
         count(*)::int AS viewers,
         min(first_viewed_at) AS first_viewed_at,
         max(last_viewed_at) AS last_viewed_at
  FROM content_views
`

/**
 * Address, town, and price for viewed properties. Listings that have since left
 * the database resolve to nothing and fall back to their MLS number on screen.
 */
async function attachListingDetails(
  rows: ContentViewSummary[],
): Promise<ContentViewSummary[]> {
  const mlsIds = [
    ...new Set(rows.map((r) => r.mlsId).filter((id): id is string => Boolean(id))),
  ]
  if (mlsIds.length === 0) return rows

  let labels: ListingLabelRow[] = []
  try {
    labels = await query<ListingLabelRow>(
      `SELECT mls_id, address_street, address_full, town, price, mls_status
       FROM listings
       WHERE mls_id = ANY($1::text[])`,
      [mlsIds],
    )
  } catch {
    return rows
  }

  const byMls = new Map(labels.map((row) => [row.mls_id, row]))
  return rows.map((row) => {
    const label = row.mlsId ? byMls.get(row.mlsId) : undefined
    if (!label) return row
    return {
      ...row,
      address: label.address_street || label.address_full,
      town: label.town,
      price: label.price === null ? null : toNumber(label.price),
      status: label.mls_status,
    }
  })
}

/** Most-viewed content of one kind, highest running view count first. */
export async function readTopContentViews(options: {
  kind: ContentViewKind
  limit?: number
}): Promise<ContentViewSummary[]> {
  await ensureContentViewsTable()
  const limit = Math.min(Math.max(1, Math.floor(options.limit ?? 10)), 200)
  const rows = await query<AggregateRow>(
    `${AGGREGATE_SELECT}
     WHERE kind = $1
     GROUP BY content_key
     ORDER BY views DESC, viewers DESC, last_viewed_at DESC
     LIMIT $2`,
    [options.kind, limit],
  )
  const summaries = rows.map(aggregateRowToSummary)
  return options.kind === 'listing' ? attachListingDetails(summaries) : summaries
}

export type ContentViewTotals = {
  properties: number
  propertyViews: number
  pages: number
  pageViews: number
  since: string | null
}

export async function readContentViewTotals(): Promise<ContentViewTotals> {
  await ensureContentViewsTable()
  const rows = await query<{
    kind: string
    items: string | number
    views: string | number
    since: Date | string | null
  }>(
    `SELECT kind,
            count(DISTINCT content_key)::int AS items,
            sum(views)::bigint AS views,
            min(first_viewed_at) AS since
     FROM content_views
     GROUP BY kind`,
  )
  const listing = rows.find((r) => r.kind === 'listing')
  const page = rows.find((r) => r.kind === 'page')
  const starts = rows
    .map((r) => (r.since ? tsToIso(r.since) : null))
    .filter((v): v is string => Boolean(v))
    .sort()
  return {
    properties: toNumber(listing?.items ?? 0),
    propertyViews: toNumber(listing?.views ?? 0),
    pages: toNumber(page?.items ?? 0),
    pageViews: toNumber(page?.views ?? 0),
    since: starts[0] ?? null,
  }
}

/**
 * What one visitor looked at, most-viewed first. Unlike `visitors.pages` this is
 * not capped at the last 50 hits, so it holds their whole history.
 */
export async function readVisitorContentViews(
  vid: string,
  limit = 40,
): Promise<ContentViewSummary[]> {
  await ensureContentViewsTable()
  const id = vid.trim()
  if (!id) return []
  const capped = Math.min(Math.max(1, Math.floor(limit)), 200)
  const rows = await query<AggregateRow>(
    `${AGGREGATE_SELECT}
     WHERE vid = $1
     GROUP BY content_key
     ORDER BY views DESC, last_viewed_at DESC
     LIMIT $2`,
    [id, capped],
  )
  return attachListingDetails(rows.map(aggregateRowToSummary))
}

/** Property labels for the MLS ids appearing in a visitor log, keyed by MLS id. */
export async function readListingLabelsByMlsIds(
  mlsIds: readonly string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(mlsIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return {}
  let rows: ListingLabelRow[] = []
  try {
    rows = await query<ListingLabelRow>(
      `SELECT mls_id, address_street, address_full, town, price, mls_status
       FROM listings
       WHERE mls_id = ANY($1::text[])`,
      [ids],
    )
  } catch {
    return {}
  }
  const labels: Record<string, string> = {}
  for (const row of rows) {
    const street = row.address_street || row.address_full
    if (!street) continue
    labels[row.mls_id] = row.town ? `${street}, ${row.town}` : street
  }
  return labels
}
