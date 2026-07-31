import 'server-only'

import { execute, query } from '@/lib/db/postgres'
import {
  resolveViewedContent,
  type ContentViewKind,
  type ContentViewSummary,
} from '@/lib/content-views'

let ensured = false
let singularListingPagesHealed = false

/**
 * Fold legacy `page:/listing/{id}` rows into `listing:{id}` (canonical plural path).
 * Safe to re-run — no-op once those page rows are gone.
 */
async function healSingularListingPageViews(): Promise<void> {
  if (singularListingPagesHealed) return
  try {
    // Merge into an existing listing row for the same visitor when present.
    await execute(`
      WITH bad AS (
        SELECT content_key,
               vid,
               views,
               first_viewed_at,
               last_viewed_at,
               substring(path from '^/listing/([^/?#]+)') AS mls_id
        FROM content_views
        WHERE kind = 'page'
          AND path ~ '^/listing/[^/?#]+'
      ),
      merged AS (
        UPDATE content_views AS good
        SET views = good.views + bad.views,
            first_viewed_at = LEAST(good.first_viewed_at, bad.first_viewed_at),
            last_viewed_at = GREATEST(good.last_viewed_at, bad.last_viewed_at)
        FROM bad
        WHERE bad.mls_id IS NOT NULL
          AND good.vid = bad.vid
          AND good.content_key = 'listing:' || bad.mls_id
        RETURNING bad.content_key AS bad_key, bad.vid AS bad_vid
      )
      DELETE FROM content_views AS cv
      USING merged AS m
      WHERE cv.content_key = m.bad_key AND cv.vid = m.bad_vid
    `)
    // Remaining singular-page rows have no listing twin — rewrite in place.
    await execute(`
      UPDATE content_views
      SET content_key = 'listing:' || substring(path from '^/listing/([^/?#]+)'),
          kind = 'listing',
          mls_id = substring(path from '^/listing/([^/?#]+)'),
          path = '/listings/' || substring(path from '^/listing/([^/?#]+)')
      WHERE kind = 'page'
        AND path ~ '^/listing/[^/?#]+'
    `)
    singularListingPagesHealed = true
  } catch (err) {
    console.warn('[content-views] singular /listing/ page heal failed', err)
  }
}

/** Idempotent guard so a database without migration 0012 still records views. */
export async function ensureContentViewsTable(): Promise<void> {
  if (ensured) {
    await healSingularListingPageViews()
    return
  }
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
  await healSingularListingPageViews()
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
  id: string
  mls_id: string
  listing_key: string | null
  address_street: string | null
  address_full: string | null
  town: string | null
  price: string | number | null
  mls_status: string | null
}

/** View logs store whatever was in the URL (id, mls_id, or listing_key). */
function listingLabelLookupKeys(row: ListingLabelRow): string[] {
  const raw = [row.id, row.mls_id, row.listing_key]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
  // Index both original and lower-case — Matrix keys / URL casing can differ.
  const out = new Set<string>()
  for (const key of raw) {
    out.add(key)
    out.add(key.toLowerCase())
  }
  return [...out]
}

function resolvedStreet(row: ListingLabelRow): string | null {
  const street = row.address_street?.trim() || row.address_full?.trim() || ''
  return street || null
}

async function fetchListingLabelsByIds(
  ids: readonly string[],
): Promise<ListingLabelRow[]> {
  if (ids.length === 0) return []
  const lowered = [...new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean))]
  if (lowered.length === 0) return []
  // Prefer denormalized address columns; fall back to JSON `data.address`
  // (some rows sync with empty street columns).
  return query<ListingLabelRow>(
    `SELECT id,
            mls_id,
            listing_key,
            COALESCE(
              NULLIF(btrim(address_street), ''),
              NULLIF(btrim(address_full), ''),
              NULLIF(btrim(data->'address'->>'street'), ''),
              NULLIF(btrim(data->'address'->>'full'), ''),
              NULLIF(
                btrim(concat_ws(' ', raw->>'StreetNumber', raw->>'StreetName')),
                ''
              ),
              NULLIF(btrim(raw->>'UnparsedAddress'), '')
            ) AS address_street,
            COALESCE(
              NULLIF(btrim(address_full), ''),
              NULLIF(btrim(data->'address'->>'full'), ''),
              NULLIF(btrim(raw->>'UnparsedAddress'), '')
            ) AS address_full,
            COALESCE(
              NULLIF(btrim(town), ''),
              NULLIF(btrim(data->'address'->>'city'), ''),
              NULLIF(btrim(raw->>'City'), '')
            ) AS town,
            price,
            mls_status
     FROM listings
     WHERE lower(id) = ANY($1::text[])
        OR lower(mls_id) = ANY($1::text[])
        OR lower(listing_key) = ANY($1::text[])`,
    [lowered],
  )
}

/** Ids to resolve — mls_id from the row, plus the listing:… content_key suffix. */
function lookupIdsFromSummaries(rows: ContentViewSummary[]): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.mlsId?.trim()) ids.add(row.mlsId.trim())
    if (row.kind === 'listing' && row.contentKey.startsWith('listing:')) {
      const fromKey = row.contentKey.slice('listing:'.length).trim()
      if (fromKey) ids.add(fromKey)
    }
  }
  return [...ids]
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
  const mlsIds = lookupIdsFromSummaries(rows)
  if (mlsIds.length === 0) return rows

  let labels: ListingLabelRow[] = []
  try {
    labels = await fetchListingLabelsByIds(mlsIds)
  } catch {
    return rows
  }

  const byKey = new Map<string, ListingLabelRow>()
  for (const label of labels) {
    for (const key of listingLabelLookupKeys(label)) {
      byKey.set(key, label)
    }
  }

  const findLabel = (row: ContentViewSummary): ListingLabelRow | undefined => {
    const candidates = [
      row.mlsId?.trim(),
      row.kind === 'listing' && row.contentKey.startsWith('listing:')
        ? row.contentKey.slice('listing:'.length).trim()
        : null,
    ].filter((v): v is string => Boolean(v))
    for (const id of candidates) {
      const hit = byKey.get(id) ?? byKey.get(id.toLowerCase())
      if (hit) return hit
    }
    return undefined
  }

  return rows.map((row) => {
    const label = findLabel(row)
    if (!label) return row
    const address = resolvedStreet(label)
    return {
      ...row,
      address,
      town: label.town,
      price: label.price === null ? null : toNumber(label.price),
      status: label.mls_status,
      // Prefer the short MLS number for display chrome when the URL used a listing key.
      mlsId: label.mls_id?.trim() || row.mlsId,
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

/**
 * Property labels for ids appearing in a visitor log (URL id / mls_id /
 * listing_key), keyed by whichever identifier was requested.
 */
export async function readListingLabelsByMlsIds(
  mlsIds: readonly string[],
): Promise<Record<string, string>> {
  const idSet = new Set(mlsIds.map((id) => id.trim()).filter(Boolean))
  const ids = [...idSet]
  if (ids.length === 0) return {}
  let rows: ListingLabelRow[] = []
  try {
    rows = await fetchListingLabelsByIds(ids)
  } catch {
    return {}
  }
  const labels: Record<string, string> = {}
  const idSetLower = new Set([...idSet].map((id) => id.toLowerCase()))
  for (const row of rows) {
    const street = resolvedStreet(row)
    if (!street) continue
    const label = row.town ? `${street}, ${row.town}` : street
    for (const key of listingLabelLookupKeys(row)) {
      if (idSet.has(key) || idSetLower.has(key.toLowerCase())) {
        // Prefer the caller's original casing as the map key.
        const requested =
          [...idSet].find((id) => id.toLowerCase() === key.toLowerCase()) ?? key
        labels[requested] = label
      }
    }
  }
  return labels
}
