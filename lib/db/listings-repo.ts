import 'server-only'

import { closeFieldsFromListing, streetsMatch } from '@/lib/listing-history'
import {
  applyListingPropertyTax,
  parcelNumberFromRaw,
  parseTaxYearEnd,
  propertyTaxFromRaw,
} from '@/lib/listing-property-tax'
import type { Listing, RawRetsRecord } from '@/lib/rets'
import { query, queryOne, withTransaction } from '@/lib/db/postgres'
import { getAllSyncMeta, getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta'
import { getSyncMeta as getCachedSyncMeta } from '@/lib/db/sync-meta-store'
import type { PoolClient } from 'pg'

// ---------------------------------------------------------------------------
// listings-repo — Postgres write path (Phase 3 of the SQLite → Postgres move).
//
// Async replacement for the RETS → SQLite upsert functions in lib/listings-db.ts
// (upsertListing / upsertTownListings / upsertListingsIncremental + tax history,
// recordSyncRun, counts, inventory snapshot). The key architectural change vs
// SQLite: the normalized Listing is split into
//   * typed, indexed columns  (town, price, beds, close_date, … for SQL filters)
//   * `data`  jsonb  — the Listing WITHOUT `raw` (hydration source on read)
//   * `raw`   jsonb  — the full RETS record (catch-all / future GIN target)
//
// This module is intentionally free of any better-sqlite3 import so it can run in
// the serverless runtime without native bindings. The two small pure helpers
// (listingRowId / listingMatchesStatusBucket) mirror lib/listings-db.ts.
// ---------------------------------------------------------------------------

/** PK for a listing row — mirrors lib/listings-db.ts listingRowId(). */
export function listingRowId(listing: Pick<Listing, 'listingKey' | 'mlsId'>): string {
  return listing.listingKey?.trim() || listing.mlsId?.trim() || ''
}

/** Mirrors lib/listings-db.ts listingMatchesStatusBucket(). */
function listingMatchesStatusBucket(listing: Listing, statusBucket: string): boolean {
  const s = listing.status?.trim().toLowerCase()
  if (statusBucket === 'Active') {
    return s === 'active' || s === 'a' || s === 'coming soon' || s === 'cs'
  }
  if (statusBucket === 'Closed') {
    return s === 'closed' || s === 'c'
  }
  if (statusBucket === 'Expired') {
    return s === 'expired' || s === 'x'
  }
  return true
}

/** Parse an MLS date/timestamp string to a Date for a timestamptz column, or null. */
function toTs(value: string | null | undefined): Date | null {
  if (!value) return null
  const t = new Date(value)
  return Number.isNaN(t.getTime()) ? null : t
}

// Column order is the single source of truth for the upsert statement below.
// goldilocks_* are deliberately EXCLUDED — they are written by a separate scores
// pass (Phase 4) and must not be clobbered on a sync upsert.
const LISTING_COLUMNS = [
  'id',
  'mls_id',
  'listing_key',
  'town',
  'status_bucket',
  'mls_status',
  'property_type',
  'style',
  'postal_code',
  'address_city',
  'address_street',
  'address_full',
  'price',
  'original_list_price',
  'close_price',
  'beds',
  'baths',
  'sqft',
  'lot_acres',
  'year_built',
  'dom',
  'property_tax',
  'property_tax_year',
  'photo_count',
  'latitude',
  'longitude',
  'list_date',
  'modification_timestamp',
  'status_change_timestamp',
  'price_change_timestamp',
  'close_date',
  'data',
  'raw',
  'synced_at',
] as const

const UPSERT_LISTING_SQL = (() => {
  const cols = LISTING_COLUMNS.join(', ')
  const placeholders = LISTING_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')
  const updates = LISTING_COLUMNS.filter((c) => c !== 'id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ')
  return `INSERT INTO listings (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updates}`
})()

/**
 * Map a Listing to the ordered parameter list for UPSERT_LISTING_SQL.
 * `data` holds the normalized Listing minus `raw`; `raw` holds the RETS record.
 */
function listingToParams(
  listing: Listing,
  town: string,
  statusBucket: string,
  syncedAt: Date,
): unknown[] {
  const stored = applyListingPropertyTax(listing)
  const id = listingRowId(stored)
  const { closeDate, closePrice } = closeFieldsFromListing(stored)
  const addr = stored.address ?? null
  const { raw, ...withoutRaw } = stored
  return [
    id,
    stored.mlsId,
    stored.listingKey || null,
    town,
    statusBucket,
    stored.status || null,
    stored.propertyType || null,
    stored.style || null,
    addr?.postalCode || null,
    addr?.city || null,
    addr?.street || null,
    addr?.full || null,
    stored.price,
    stored.originalListPrice,
    closePrice,
    stored.beds,
    stored.baths,
    stored.sqft,
    stored.lotAcres,
    stored.yearBuilt,
    stored.dom,
    stored.propertyTax ?? null,
    stored.propertyTaxYear ?? null,
    stored.photoCount,
    stored.latitude,
    stored.longitude,
    toTs(stored.listDate),
    toTs(stored.modificationTimestamp),
    toTs(stored.statusChangeTimestamp),
    toTs(stored.priceChangeTimestamp),
    toTs(closeDate),
    JSON.stringify(withoutRaw),
    raw ? JSON.stringify(raw) : null,
    syncedAt,
  ]
}

/** Upsert the tax-history row derived from a listing's raw RETS record. */
async function upsertTaxHistory(
  client: PoolClient,
  listing: Listing,
  listingId: string,
  syncedAt: Date,
): Promise<void> {
  const { annualAmount, yearLabel } = propertyTaxFromRaw(listing.raw)
  if (annualAmount == null || !yearLabel) return

  const taxYearEnd = parseTaxYearEnd(yearLabel)
  if (taxYearEnd == null) return

  const parcelNumber = parcelNumberFromRaw(listing.raw) ?? listingId

  await client.query(
    `INSERT INTO listing_tax_history (
       listing_id, parcel_number, tax_year_label, tax_year_end, amount, synced_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (parcel_number, tax_year_end) DO UPDATE SET
       listing_id     = EXCLUDED.listing_id,
       tax_year_label = EXCLUDED.tax_year_label,
       amount         = EXCLUDED.amount,
       synced_at      = EXCLUDED.synced_at`,
    [listingId, parcelNumber, yearLabel, taxYearEnd, annualAmount, syncedAt],
  )
}

export type UpsertListingResult = { upserted: boolean; priceChanged: boolean }

/** Upsert a single listing without touching other rows in its town bucket. */
export async function upsertListing(
  listing: Listing,
  town: string,
  statusBucket: string,
): Promise<UpsertListingResult> {
  const id = listingRowId(listing)
  if (!id) return { upserted: false, priceChanged: false }

  const syncedAt = new Date()
  return withTransaction(async (client) => {
    const existing = await client.query<{ price: string | null }>(
      'SELECT price FROM listings WHERE id = $1',
      [id],
    )
    const previousPrice =
      existing.rows[0]?.price != null ? Number(existing.rows[0].price) : null
    const nextPrice = listing.price ?? null
    const priceChanged =
      existing.rows.length > 0 &&
      previousPrice != null &&
      nextPrice != null &&
      previousPrice !== nextPrice

    await client.query({
      name: 'upsert_listing',
      text: UPSERT_LISTING_SQL,
      values: listingToParams(listing, town, statusBucket, syncedAt),
    })
    await upsertTaxHistory(client, listing, id, syncedAt)
    return { upserted: true, priceChanged }
  })
}

export type UpsertTownResult = {
  seen: number
  inserted: number
  updated: number
  deleted: number
  /** Ids removed from the bucket (delisted) — caller handles photo cleanup. */
  deletedIds: string[]
}

/**
 * Replace a town/bucket pool: upsert every supplied listing, then delete rows in
 * that bucket that were not seen (delisted). Mirrors lib/listings-db.ts
 * upsertTownListings, including the "never wipe on an empty pull" guard.
 */
export async function upsertTownListings(
  town: string,
  statusBucket: string,
  listings: Listing[],
): Promise<UpsertTownResult> {
  const empty: UpsertTownResult = {
    seen: 0,
    inserted: 0,
    updated: 0,
    deleted: 0,
    deletedIds: [],
  }

  // Never wipe a town bucket on an empty pull — transient RETS gaps would delete good cache.
  if (listings.length === 0) return empty

  const rows = listings.filter((l) => listingMatchesStatusBucket(l, statusBucket))
  if (rows.length === 0) {
    if (statusBucket === 'Closed') {
      console.warn(
        `[listings-repo] ${town} Closed sync returned ${listings.length} rows but none are Closed — skipping upsert`,
      )
    }
    return empty
  }

  const syncedAt = new Date()
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM listings WHERE town = $1 AND status_bucket = $2',
      [town, statusBucket],
    )
    const existingIds = new Set(existing.rows.map((r) => r.id))
    const seen = new Set<string>()
    let inserted = 0
    let updated = 0

    for (const listing of rows) {
      const id = listingRowId(listing)
      if (!id) continue
      seen.add(id)
      if (existingIds.has(id)) updated += 1
      else inserted += 1
      await client.query({
        name: 'upsert_listing',
        text: UPSERT_LISTING_SQL,
        values: listingToParams(listing, town, statusBucket, syncedAt),
      })
      await upsertTaxHistory(client, listing, id, syncedAt)
    }

    const deletedIds = [...existingIds].filter((id) => !seen.has(id))
    if (deletedIds.length > 0) {
      await client.query('DELETE FROM listings WHERE id = ANY($1::text[])', [deletedIds])
    }

    return { seen: seen.size, inserted, updated, deleted: deletedIds.length, deletedIds }
  })
}

export type IncrementalUpsertResult = { count: number; priceChangedIds: string[] }

/** Upsert changed listings without deleting the rest of the bucket (incremental sync). */
export async function upsertListingsIncremental(
  town: string,
  statusBucket: string,
  listings: Listing[],
): Promise<IncrementalUpsertResult> {
  if (listings.length === 0) return { count: 0, priceChangedIds: [] }

  const rows = listings.filter((l) => listingMatchesStatusBucket(l, statusBucket))
  if (rows.length === 0) return { count: 0, priceChangedIds: [] }

  let count = 0
  const priceChangedIds: string[] = []
  for (const listing of rows) {
    const result = await upsertListing(listing, town, statusBucket)
    if (!result.upserted) continue
    count += 1
    if (result.priceChanged) {
      const id = listingRowId(listing)
      if (id) priceChangedIds.push(id)
    }
  }
  return { count, priceChangedIds }
}

// ---------------------------------------------------------------------------
// Write-side bookkeeping (sync_runs, counts, latest-mod-ts, inventory snapshot)
// ---------------------------------------------------------------------------

/** Append a refresh-history / audit row. Mirrors lib/listings-db.ts recordSyncRun. */
export async function recordSyncRun(input: {
  startedAt: string
  finishedAt: string
  town: string
  statusBucket: string
  listingsCount: number
  ok: boolean
  error?: string | null
}): Promise<void> {
  await query(
    `INSERT INTO sync_runs (
       started_at, finished_at, town, status_bucket, listings_count, ok, error
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      toTs(input.startedAt),
      toTs(input.finishedAt),
      input.town,
      input.statusBucket,
      input.listingsCount,
      input.ok,
      input.error ?? null,
    ],
  )
}

export type SyncRunFailure = {
  town: string
  statusBucket: string
  error: string
  finishedAt: string
  startedAt: string
}

export async function readRecentSyncFailures(limit = 5): Promise<SyncRunFailure[]> {
  const rows = await query<{
    town: string
    statusBucket: string
    error: string
    finishedAt: string
    startedAt: string
  }>(
    `SELECT town,
            status_bucket           AS "statusBucket",
            error,
            finished_at::text       AS "finishedAt",
            started_at::text        AS "startedAt"
       FROM sync_runs
      WHERE ok = false AND error IS NOT NULL AND btrim(error) <> ''
      ORDER BY finished_at DESC
      LIMIT $1`,
    [Math.max(1, limit)],
  )
  return rows.filter((row) => row.town && row.error)
}

/** Total listings row count. */
export async function countListings(): Promise<number> {
  const row = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM listings')
  return row?.n ?? 0
}

/** Active / Closed / Expired counts. */
export async function countListingsByBucket(): Promise<Record<string, number>> {
  const rows = await query<{ bucket: string; n: number }>(
    `SELECT status_bucket AS bucket, count(*)::int AS n FROM listings GROUP BY status_bucket`,
  )
  const out: Record<string, number> = {}
  for (const row of rows) out[row.bucket] = row.n
  return out
}

/** Newest MLS modification timestamp across Active listings. */
export async function readLatestListingModificationTimestamp(): Promise<string | null> {
  const row = await queryOne<{ latest: string | null }>(
    `SELECT MAX(modification_timestamp)::text AS latest
       FROM listings
      WHERE status_bucket = 'Active' AND modification_timestamp IS NOT NULL`,
  )
  return row?.latest ?? null
}

export type InventorySnapshot = { capturedAt: string; counts: Record<string, number> }

const INVENTORY_SNAPSHOT_META_KEY = 'db_inventory_snapshot'

/** Count every public table and store the snapshot in sync_meta (diagnostics). */
export async function captureInventorySnapshot(): Promise<void> {
  try {
    const tables = await query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const counts: Record<string, number> = {}
    for (const { name } of tables) {
      try {
        // table names come from the catalog, not user input — safe to interpolate quoted.
        const row = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM "${name}"`)
        counts[name] = row?.n ?? -1
      } catch {
        counts[name] = -1
      }
    }
    const snapshot: InventorySnapshot = { capturedAt: new Date().toISOString(), counts }
    await setSyncMeta(INVENTORY_SNAPSHOT_META_KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.warn('[listings-repo] captureInventorySnapshot failed:', err)
  }
}

export async function readInventorySnapshot(): Promise<InventorySnapshot | null> {
  try {
    const raw = await getSyncMeta(INVENTORY_SNAPSHOT_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as InventorySnapshot).capturedAt === 'string' &&
      typeof (parsed as InventorySnapshot).counts === 'object'
    ) {
      return parsed as InventorySnapshot
    }
    return null
  } catch {
    return null
  }
}

/** All sync_meta as a plain object (re-exported for sync orchestration convenience). */
export { getAllSyncMeta }

// ---------------------------------------------------------------------------
// Inventory stats (Phase 4 Tier C3b). Async replacement for the synchronous
// getListingsDbStats() in lib/listings-db.ts — counts come from Postgres,
// timestamps from the startup-hydrated sync_meta store.
// ---------------------------------------------------------------------------

export type ListingsDbStats = {
  total: number
  byTown: Record<string, number>
  lastFullSync: string | null
  lastFullSyncStarted: string | null
  lastIncrementalSync: string | null
  lastIncrementalSyncStarted: string | null
  lastListingScores: string | null
  lastListingScoresStarted: string | null
  lastListingSuperlatives: string | null
  lastListingSuperlativesStarted: string | null
  lastListingEdgeScores: string | null
  statsCacheEntries: number
  lastStatsCache: string | null
  lastStatsCacheStarted: string | null
  dealOfTheDayCacheEntries: number
  lastDealOfTheDayCache: string | null
  lastDealOfTheDayCacheStarted: string | null
}

/** Live inventory + cache timestamps for admin/sync status panels. */
export async function readListingsDbStats(): Promise<ListingsDbStats> {
  const empty: ListingsDbStats = {
    total: 0,
    byTown: {},
    lastFullSync: getCachedSyncMeta('last_full_sync'),
    lastFullSyncStarted: getCachedSyncMeta('last_full_sync_started'),
    lastIncrementalSync: getCachedSyncMeta('last_incremental_sync'),
    lastIncrementalSyncStarted: getCachedSyncMeta('last_incremental_sync_started'),
    lastListingScores: getCachedSyncMeta('last_listing_scores'),
    lastListingScoresStarted: getCachedSyncMeta('last_listing_scores_started'),
    lastListingSuperlatives: getCachedSyncMeta('last_listing_superlatives'),
    lastListingSuperlativesStarted: getCachedSyncMeta('last_listing_superlatives_started'),
    lastListingEdgeScores: getCachedSyncMeta('last_listing_edge_scores'),
    statsCacheEntries: 0,
    lastStatsCache: getCachedSyncMeta('last_stats_cache'),
    lastStatsCacheStarted: getCachedSyncMeta('last_stats_cache_started'),
    dealOfTheDayCacheEntries: 0,
    lastDealOfTheDayCache: getCachedSyncMeta('last_deal_of_the_day_cache'),
    lastDealOfTheDayCacheStarted: getCachedSyncMeta('last_deal_of_the_day_cache_started'),
  }

  try {
    const [totalRow, townRows, statsCacheRow, dealOfDayRow] = await Promise.all([
      queryOne<{ count: number }>('SELECT count(*)::int AS count FROM listings'),
      query<{ town: string; count: number }>(
        `SELECT town, count(*)::int AS count
           FROM listings
          WHERE status_bucket = 'Active'
          GROUP BY town`,
      ),
      queryOne<{ count: number }>('SELECT count(*)::int AS count FROM stats_cache'),
      queryOne<{ count: number }>(
        `SELECT count(*)::int AS count FROM stats_cache WHERE cache_key LIKE 'deal-of-the-day:%'`,
      ),
    ])

    const byTown: Record<string, number> = {}
    for (const row of townRows) byTown[row.town] = row.count

    return {
      ...empty,
      total: totalRow?.count ?? 0,
      byTown,
      statsCacheEntries: statsCacheRow?.count ?? 0,
      dealOfTheDayCacheEntries: dealOfDayRow?.count ?? 0,
    }
  } catch (err) {
    console.warn('[listings-repo] readListingsDbStats failed:', err)
    return empty
  }
}

// ---------------------------------------------------------------------------
// Listing reads (Phase 4). Every Listing field is hydrated from `data` (the
// original serialized Listing minus raw) merged with the `raw` jsonb column, so
// values are byte-identical to the SQLite era. The typed columns are used ONLY
// for SQL filtering / sorting, never for hydration — this sidesteps the
// timestamptz-vs-original-string format difference entirely.
// ---------------------------------------------------------------------------

export type RecentlyUpdatedRow = {
  listing: Listing
  town: string
  modificationTimestamp: string | null
  syncedAt: string
  goldilocksScore: number | null
  goldilocksBreakdown: string | null
  goldilocksScoredAt: string | null
}

type ListingJsonRow = { data: unknown; raw: unknown }

/** Reconstruct a full Listing from the split data/raw jsonb columns. */
function rowToListing(row: ListingJsonRow): Listing {
  // `data` is NOT NULL in the schema, so it is always a serialized Listing object.
  const base = row.data as Listing
  const raw = (row.raw ?? {}) as RawRetsRecord
  return applyListingPropertyTax({ ...base, raw })
}

/** jsonb column (parsed to object by pg) back to the string contract SQLite used. */
function jsonbToString(value: unknown): string | null {
  if (value == null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** timestamptz column (Date from pg) to an ISO string, matching SQLite storage. */
function tsToIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

const LISTING_SEARCH_STATUS_ORDER: Record<string, number> = {
  Active: 0,
  Closed: 1,
  Expired: 2,
}

export async function readRecentlyUpdatedListings(options: {
  since?: string | null
  limit?: number
  statusBucket?: string
  town?: string | null
}): Promise<RecentlyUpdatedRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)
  const statusBucket = options.statusBucket ?? 'Active'
  const since = options.since?.trim() || null
  const town = options.town?.trim() || null

  const conditions = ['status_bucket = $1', 'modification_timestamp IS NOT NULL']
  const params: unknown[] = [statusBucket]
  if (since) {
    params.push(new Date(since))
    conditions.push(`modification_timestamp > $${params.length}`)
  }
  if (town) {
    params.push(town)
    conditions.push(`town = $${params.length}`)
  }
  params.push(limit)
  const limitPlaceholder = `$${params.length}`

  const rows = await query<{
    data: unknown
    raw: unknown
    town: string
    synced_at: Date | null
    goldilocks_score: number | null
    goldilocks_breakdown: unknown
    goldilocks_scored_at: Date | null
  }>(
    `SELECT data, raw, town, synced_at, goldilocks_score, goldilocks_breakdown, goldilocks_scored_at
       FROM listings
      WHERE ${conditions.join(' AND ')}
      ORDER BY modification_timestamp DESC
      LIMIT ${limitPlaceholder}`,
    params,
  )

  return rows.map((row) => {
    const listing = rowToListing(row)
    return {
      listing,
      town: row.town,
      modificationTimestamp: listing.modificationTimestamp,
      syncedAt: tsToIso(row.synced_at) ?? '',
      goldilocksScore: row.goldilocks_score,
      goldilocksBreakdown: jsonbToString(row.goldilocks_breakdown),
      goldilocksScoredAt: tsToIso(row.goldilocks_scored_at),
    }
  })
}

export async function searchListingsInDbByQuery(
  queryText: string,
  options: { limit?: number; statusBuckets?: string[] } = {},
): Promise<Listing[]> {
  const q = queryText.trim().toLowerCase()
  if (q.length < 2) return []

  const limit = Math.min(Math.max(options.limit ?? 8, 1), 50)
  const buckets = options.statusBuckets ?? ['Active', 'Closed', 'Expired']
  if (buckets.length === 0) return []

  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const rows = await query<{ data: unknown; raw: unknown; status_bucket: string }>(
    `SELECT data, raw, status_bucket
       FROM listings
      WHERE status_bucket = ANY($1::text[])
        AND (
          mls_id ILIKE $2
          OR (data->'address'->>'full') ILIKE $2
          OR (data->'address'->>'street') ILIKE $2
          OR (data->'address'->>'city') ILIKE $2
          OR (data->'address'->>'postalCode') ILIKE $2
          OR (data->>'propertyType') ILIKE $2
        )
      ORDER BY modification_timestamp DESC NULLS LAST
      LIMIT $3`,
    [buckets, pattern, limit * 3],
  )

  const scored: { listing: Listing; score: number }[] = []
  for (const row of rows) {
    const listing = rowToListing(row)
    const hay = [
      listing.mlsId,
      listing.address.full,
      listing.address.street,
      listing.address.city,
      listing.address.postalCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) continue
    let score = LISTING_SEARCH_STATUS_ORDER[row.status_bucket] ?? 9
    const street = listing.address.street?.toLowerCase() ?? ''
    const full = listing.address.full?.toLowerCase() ?? ''
    if (listing.mlsId.toLowerCase() === q) score -= 30
    else if (street.startsWith(q) || full.startsWith(q)) score -= 20
    else if (street.includes(q) || full.includes(q)) score -= 10
    scored.push({ listing, score })
  }

  scored.sort((a, b) => a.score - b.score)
  const seen = new Set<string>()
  const out: Listing[] = []
  for (const row of scored) {
    const key = row.listing.listingKey || row.listing.mlsId
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row.listing)
    if (out.length >= limit) break
  }
  return out
}

/** Other MLS records at the same street address within a town. */
export async function readAddressListingsFromDb(
  town: string,
  street: string,
  excludeMlsId?: string,
): Promise<Listing[]> {
  const rows = await query<ListingJsonRow>(
    'SELECT data, raw FROM listings WHERE town = $1',
    [town],
  )
  return rows
    .map((row) => rowToListing(row))
    .filter((listing) => {
      if (excludeMlsId && listing.mlsId === excludeMlsId) return false
      const addr = listing.address.street?.trim() || listing.address.full?.trim() || ''
      return streetsMatch(street, addr)
    })
}

export type TownUpdateStat = {
  town: string
  updateCount: number
  latestUpdate: string | null
  latestListingId: string | null
  latestListingAddress: string | null
}

/** Towns ranked by count of listings modified since `since` (default last 24h). */
export async function readTownUpdateStats(
  options: { since?: string | null; statusBucket?: string } = {},
): Promise<TownUpdateStat[]> {
  const statusBucket = options.statusBucket ?? 'Active'
  const sinceIso =
    options.since?.trim() || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since = new Date(sinceIso)

  const rows = await query<{
    town: string
    update_count: number
    latest_update: Date | null
    latest_listing_id: string | null
    latest_listing_address: string | null
  }>(
    `SELECT
       l.town,
       COUNT(*)::int AS update_count,
       MAX(l.modification_timestamp) AS latest_update,
       (
         SELECT COALESCE(NULLIF(l2.listing_key, ''), l2.mls_id)
         FROM listings l2
         WHERE l2.town = l.town
           AND l2.status_bucket = $1
           AND l2.modification_timestamp IS NOT NULL
           AND l2.modification_timestamp > $2
         ORDER BY l2.modification_timestamp DESC, l2.id DESC
         LIMIT 1
       ) AS latest_listing_id,
       (
         SELECT COALESCE(
           NULLIF(l2.data->'address'->>'street', ''),
           NULLIF(l2.data->'address'->>'full', '')
         )
         FROM listings l2
         WHERE l2.town = l.town
           AND l2.status_bucket = $1
           AND l2.modification_timestamp IS NOT NULL
           AND l2.modification_timestamp > $2
         ORDER BY l2.modification_timestamp DESC, l2.id DESC
         LIMIT 1
       ) AS latest_listing_address
     FROM listings l
     WHERE l.status_bucket = $1
       AND l.modification_timestamp IS NOT NULL
       AND l.modification_timestamp > $2
     GROUP BY l.town
     ORDER BY update_count DESC, latest_update DESC`,
    [statusBucket, since],
  )

  return rows.map((row) => ({
    town: row.town,
    updateCount: row.update_count,
    latestUpdate: tsToIso(row.latest_update),
    latestListingId: row.latest_listing_id?.trim() || null,
    latestListingAddress: row.latest_listing_address?.trim() || null,
  }))
}

// ---------------------------------------------------------------------------
// Edge scores — read side (Phase 4). Writes still land via the SQLite path
// until the scores write pass is ported; jsonb columns are stringified back to
// the `string` contract the SQLite version returned so consumers (which JSON
// .parse them) are unaffected.
// ---------------------------------------------------------------------------

export type ListingEdgeScoreRow = {
  mlsId: string
  listingId: string
  edgeScore: number
  breakdownJson: string
  metadataSnapshot: string
  computedAt: string
}

/** Edge score rows for a set of MLS ids, keyed by mls_id. */
export async function readListingEdgeScoresByMlsIds(
  mlsIds: readonly string[],
): Promise<Map<string, ListingEdgeScoreRow>> {
  const out = new Map<string, ListingEdgeScoreRow>()
  const unique = [...new Set(mlsIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return out

  const rows = await query<{
    mls_id: string
    listing_id: string
    edge_score: number
    breakdown_json: unknown
    metadata_snapshot: unknown
    computed_at: Date | null
  }>(
    `SELECT mls_id, listing_id, edge_score, breakdown_json, metadata_snapshot, computed_at
       FROM listing_edge_scores
      WHERE mls_id = ANY($1::text[])`,
    [unique],
  )
  for (const row of rows) {
    out.set(row.mls_id, {
      mlsId: row.mls_id,
      listingId: row.listing_id,
      edgeScore: row.edge_score,
      breakdownJson: jsonbToString(row.breakdown_json) ?? '',
      metadataSnapshot: jsonbToString(row.metadata_snapshot) ?? '',
      computedAt: tsToIso(row.computed_at) ?? '',
    })
  }
  return out
}

/** Single edge score row by MLS id. */
export async function readListingEdgeScoreByMlsId(
  mlsId: string,
): Promise<ListingEdgeScoreRow | null> {
  const id = mlsId.trim()
  if (!id) return null
  return (await readListingEdgeScoresByMlsIds([id])).get(id) ?? null
}

/** jsonb array (parsed by pg) or a serialized string → validated badge words. */
function parseSuperlativeWords(value: unknown): string[] {
  let arr: unknown = value
  if (typeof value === 'string') {
    try {
      arr = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.filter((w): w is string => typeof w === 'string' && w.length > 0)
}

/** Superlative badge words per MLS id (ids with zero badges are omitted). */
export async function readListingSuperlativesByMlsIds(
  mlsIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const unique = [...new Set(mlsIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return out

  const rows = await query<{ mls_id: string; superlatives_json: unknown }>(
    `SELECT mls_id, superlatives_json
       FROM listing_superlatives
      WHERE mls_id = ANY($1::text[])`,
    [unique],
  )
  for (const row of rows) {
    const words = parseSuperlativeWords(row.superlatives_json)
    if (words.length > 0) out.set(row.mls_id, words)
  }
  return out
}

// ---------------------------------------------------------------------------
// Listing pool + single-listing reads (Phase 4 Tier C). Async replacements for
// lib/listings-db.ts readListingsFromDb / readAllListingsFromDb /
// readListingByIdFromDb. Full Listing is reconstructed from data + raw jsonb via
// rowToListing. Price ordering mirrors SQLite: highest price first, NULLs last.
// ---------------------------------------------------------------------------

/** One town/bucket pool, priced high→low (nulls last). */
export async function readListingsFromDb(
  town: string,
  statusBucket: string,
  limit?: number,
): Promise<Listing[]> {
  const params: unknown[] = [town, statusBucket]
  let sql = `SELECT data, raw FROM listings
              WHERE town = $1 AND status_bucket = $2
              ORDER BY price DESC NULLS LAST`
  if (limit != null) {
    params.push(limit)
    sql += ` LIMIT $3`
  }
  const rows = await query<ListingJsonRow>(sql, params)
  return rows.map((row) => rowToListing(row))
}

/** All listings across several towns for one bucket, priced high→low (nulls last). */
export async function readAllListingsFromDb(
  towns: readonly string[],
  statusBucket: string,
): Promise<Listing[]> {
  if (towns.length === 0) return []
  const rows = await query<ListingJsonRow>(
    `SELECT data, raw FROM listings
      WHERE status_bucket = $1 AND town = ANY($2::text[])
      ORDER BY price DESC NULLS LAST`,
    [statusBucket, [...towns]],
  )
  return rows.map((row) => rowToListing(row))
}

/** Single listing by row id, MLS id, or listing key. */
export async function readListingByIdFromDb(id: string): Promise<Listing | null> {
  const key = id.trim()
  if (!key) return null
  const row = await queryOne<ListingJsonRow>(
    `SELECT data, raw FROM listings
      WHERE id = $1 OR mls_id = $1 OR listing_key = $1
      LIMIT 1`,
    [key],
  )
  return row ? rowToListing(row) : null
}

// ---------------------------------------------------------------------------
// Inventory-presence gate (Phase 4 Tier C). Async replacement for the SQLite
// hasLocalListingsCache() / listingsDbHasRows() check. Semantics: "the listings
// table holds inventory" (not "a DB file is loaded"). Memoized true→forever
// once observed, since inventory presence only flips false→true (first sync)
// and never back; while still false we re-query so a cold Postgres warms up.
// ---------------------------------------------------------------------------

let listingsPresenceObserved = false

/** True once the listings table has at least one row. */
export async function hasListingsData(): Promise<boolean> {
  if (listingsPresenceObserved) return true
  const row = await queryOne<{ present: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM listings LIMIT 1) AS present',
  )
  const present = row?.present === true
  if (present) listingsPresenceObserved = true
  return present
}

/** Total Active listings (for warm/skip heuristics). */
export async function countActiveListings(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM listings WHERE status_bucket = 'Active'`,
  )
  return row?.count ?? 0
}

/** Total superlative rows. */
export async function countListingSuperlatives(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM listing_superlatives',
  )
  return row?.count ?? 0
}

// ---------------------------------------------------------------------------
// Derived-table writes + reads (Phase 4 Tier C3a). Async Postgres replacements
// for the remaining lib/listings-db.ts derived accessors: Goldilocks scores
// (inline listings columns), edge-score writes, superlative writes, If
// estimates, comparable relations, and property-tax meta/history. jsonb columns
// take a serialized string cast to ::jsonb; numeric columns (pg returns them as
// strings) are coerced back to number via numOrNull. Timestamps use toTs on the
// way in and tsToIso on the way out so values match the SQLite-era ISO strings.
// ---------------------------------------------------------------------------

/** pg returns numeric/decimal columns as strings — coerce to number | null. */
function numOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export type ListingScoreRow = {
  score: number
  breakdownJson: string | null
  scoredAt: string | null
}

/** Persist Goldilocks scores (inline listings columns) computed during a reload. */
export async function upsertListingScores(
  rows: { id: string; score: number; breakdownJson: string; scoredAt: string }[],
): Promise<number> {
  if (rows.length === 0) return 0
  return withTransaction(async (client) => {
    let updated = 0
    for (const row of rows) {
      const result = await client.query(
        `UPDATE listings
            SET goldilocks_score = $1,
                goldilocks_breakdown = $2::jsonb,
                goldilocks_scored_at = $3
          WHERE id = $4`,
        [row.score, row.breakdownJson, toTs(row.scoredAt), row.id],
      )
      updated += result.rowCount ?? 0
    }
    return updated
  })
}

/** Read persisted Goldilocks scores by listing id. */
export async function readListingScoresByIds(
  ids: readonly string[],
): Promise<Map<string, ListingScoreRow>> {
  const out = new Map<string, ListingScoreRow>()
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return out

  const rows = await query<{
    id: string
    goldilocks_score: number
    goldilocks_breakdown: unknown
    goldilocks_scored_at: Date | null
  }>(
    `SELECT id, goldilocks_score, goldilocks_breakdown, goldilocks_scored_at
       FROM listings
      WHERE id = ANY($1::text[]) AND goldilocks_score IS NOT NULL`,
    [unique],
  )
  for (const row of rows) {
    out.set(row.id, {
      score: row.goldilocks_score,
      breakdownJson: jsonbToString(row.goldilocks_breakdown),
      scoredAt: tsToIso(row.goldilocks_scored_at),
    })
  }
  return out
}

/** Persist weekly metadata edge scores keyed by MLS id. */
export async function upsertListingEdgeScores(
  rows: {
    mlsId: string
    listingId: string
    edgeScore: number
    breakdownJson: string
    metadataSnapshot: string
    computedAt: string
  }[],
): Promise<number> {
  if (rows.length === 0) return 0
  return withTransaction(async (client) => {
    let updated = 0
    for (const row of rows) {
      await client.query(
        `INSERT INTO listing_edge_scores (
           mls_id, listing_id, edge_score, breakdown_json, metadata_snapshot, computed_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
         ON CONFLICT (mls_id) DO UPDATE SET
           listing_id        = EXCLUDED.listing_id,
           edge_score        = EXCLUDED.edge_score,
           breakdown_json    = EXCLUDED.breakdown_json,
           metadata_snapshot = EXCLUDED.metadata_snapshot,
           computed_at       = EXCLUDED.computed_at`,
        [
          row.mlsId,
          row.listingId,
          row.edgeScore,
          row.breakdownJson,
          row.metadataSnapshot,
          toTs(row.computedAt),
        ],
      )
      updated += 1
    }
    return updated
  })
}

/** Persist peer-relative listing superlatives keyed by listing id. */
export async function upsertListingSuperlatives(
  rows: {
    listingId: string
    mlsId: string
    superlativesJson: string
    computedAt: string
  }[],
): Promise<number> {
  if (rows.length === 0) return 0
  return withTransaction(async (client) => {
    let updated = 0
    for (const row of rows) {
      await client.query(
        `INSERT INTO listing_superlatives (
           listing_id, mls_id, superlatives_json, computed_at
         ) VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (listing_id) DO UPDATE SET
           mls_id            = EXCLUDED.mls_id,
           superlatives_json = EXCLUDED.superlatives_json,
           computed_at       = EXCLUDED.computed_at`,
        [row.listingId, row.mlsId, row.superlativesJson, toTs(row.computedAt)],
      )
      updated += 1
    }
    return updated
  })
}

/** Superlative badge words per listing id (ids with zero badges are omitted). */
export async function readListingSuperlativesByListingIds(
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return out

  const rows = await query<{ listing_id: string; superlatives_json: unknown }>(
    `SELECT listing_id, superlatives_json
       FROM listing_superlatives
      WHERE listing_id = ANY($1::text[])`,
    [unique],
  )
  for (const row of rows) {
    const words = parseSuperlativeWords(row.superlatives_json)
    if (words.length > 0) out.set(row.listing_id, words)
  }
  return out
}

export type ListingIfEstimateRow = {
  listingId: string
  saleAmount: number | null
  saleAmountLow: number | null
  saleAmountHigh: number | null
  saleSoldCount: number
  saleActiveCount: number
  rentAmount: number | null
  rentAmountLow: number | null
  rentAmountHigh: number | null
  rentSoldCount: number
  rentActiveCount: number
  computedAt: string
}

export async function upsertListingIfEstimate(row: ListingIfEstimateRow): Promise<void> {
  await query(
    `INSERT INTO listing_if_estimates (
       listing_id, sale_amount, sale_amount_low, sale_amount_high,
       sale_sold_count, sale_active_count,
       rent_amount, rent_amount_low, rent_amount_high,
       rent_sold_count, rent_active_count, computed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (listing_id) DO UPDATE SET
       sale_amount       = EXCLUDED.sale_amount,
       sale_amount_low   = EXCLUDED.sale_amount_low,
       sale_amount_high  = EXCLUDED.sale_amount_high,
       sale_sold_count   = EXCLUDED.sale_sold_count,
       sale_active_count = EXCLUDED.sale_active_count,
       rent_amount       = EXCLUDED.rent_amount,
       rent_amount_low   = EXCLUDED.rent_amount_low,
       rent_amount_high  = EXCLUDED.rent_amount_high,
       rent_sold_count   = EXCLUDED.rent_sold_count,
       rent_active_count = EXCLUDED.rent_active_count,
       computed_at       = EXCLUDED.computed_at`,
    [
      row.listingId,
      row.saleAmount,
      row.saleAmountLow,
      row.saleAmountHigh,
      row.saleSoldCount,
      row.saleActiveCount,
      row.rentAmount,
      row.rentAmountLow,
      row.rentAmountHigh,
      row.rentSoldCount,
      row.rentActiveCount,
      toTs(row.computedAt),
    ],
  )
}

export async function readListingIfEstimate(
  listingId: string,
): Promise<ListingIfEstimateRow | null> {
  const id = listingId.trim()
  if (!id) return null
  const row = await queryOne<{
    listing_id: string
    sale_amount: unknown
    sale_amount_low: unknown
    sale_amount_high: unknown
    sale_sold_count: number
    sale_active_count: number
    rent_amount: unknown
    rent_amount_low: unknown
    rent_amount_high: unknown
    rent_sold_count: number
    rent_active_count: number
    computed_at: Date | null
  }>(
    `SELECT listing_id, sale_amount, sale_amount_low, sale_amount_high,
            sale_sold_count, sale_active_count,
            rent_amount, rent_amount_low, rent_amount_high,
            rent_sold_count, rent_active_count, computed_at
       FROM listing_if_estimates
      WHERE listing_id = $1
      LIMIT 1`,
    [id],
  )
  if (!row) return null
  return {
    listingId: row.listing_id,
    saleAmount: numOrNull(row.sale_amount),
    saleAmountLow: numOrNull(row.sale_amount_low),
    saleAmountHigh: numOrNull(row.sale_amount_high),
    saleSoldCount: row.sale_sold_count,
    saleActiveCount: row.sale_active_count,
    rentAmount: numOrNull(row.rent_amount),
    rentAmountLow: numOrNull(row.rent_amount_low),
    rentAmountHigh: numOrNull(row.rent_amount_high),
    rentSoldCount: row.rent_sold_count,
    rentActiveCount: row.rent_active_count,
    computedAt: tsToIso(row.computed_at) ?? '',
  }
}

export type ListingRelationKind =
  | 'comp_sold'
  | 'comp_active'
  | 'rental_sold'
  | 'rental_active'

export type ListingRelationRow = {
  subjectId: string
  relatedId: string
  relation: ListingRelationKind
  rank: number
  score: number | null
  payload: string
  computedAt: string
}

export async function replaceListingRelationsForSubject(
  subjectId: string,
  relations: ListingRelationKind[],
  rows: ListingRelationRow[],
): Promise<void> {
  const id = subjectId.trim()
  if (!id || relations.length === 0) return
  await withTransaction(async (client) => {
    for (const relation of relations) {
      await client.query(
        'DELETE FROM listing_relations WHERE subject_id = $1 AND relation = $2',
        [id, relation],
      )
    }
    for (const row of rows) {
      await client.query(
        `INSERT INTO listing_relations (
           subject_id, related_id, relation, rank, score, payload, computed_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          row.subjectId,
          row.relatedId,
          row.relation,
          row.rank,
          row.score,
          row.payload,
          toTs(row.computedAt),
        ],
      )
    }
  })
}

export async function readListingRelations(
  subjectId: string,
  relations: readonly ListingRelationKind[],
): Promise<ListingRelationRow[]> {
  const id = subjectId.trim()
  if (!id || relations.length === 0) return []
  const rows = await query<{
    subject_id: string
    related_id: string
    relation: ListingRelationKind
    rank: number
    score: number | null
    payload: unknown
    computed_at: Date | null
  }>(
    `SELECT subject_id, related_id, relation, rank, score, payload, computed_at
       FROM listing_relations
      WHERE subject_id = $1 AND relation = ANY($2::text[])
      ORDER BY relation ASC, rank ASC`,
    [id, [...relations]],
  )
  return rows.map((row) => ({
    subjectId: row.subject_id,
    relatedId: row.related_id,
    relation: row.relation,
    rank: row.rank,
    score: row.score,
    payload: jsonbToString(row.payload) ?? '{}',
    computedAt: tsToIso(row.computed_at) ?? '',
  }))
}

export async function deleteListingRelations(subjectId: string): Promise<void> {
  const id = subjectId.trim()
  if (!id) return
  await query('DELETE FROM listing_relations WHERE subject_id = $1', [id])
}

export type ListingTaxHistoryRow = {
  taxYearEnd: number
  taxYearLabel: string
  amount: number
}

export type ListingTaxMetaRow = {
  listingId: string
  mlsId: string
  parcelNumber: string | null
  propertyTaxYear: string | null
}

/** Lightweight tax fields for property-tax history without hydrating the listing. */
export async function readListingTaxMetaFromDb(
  id: string,
): Promise<ListingTaxMetaRow | null> {
  const key = id.trim()
  if (!key) return null
  const row = await queryOne<{
    listingId: string
    mlsId: string
    parcelNumber: string | null
    propertyTaxYear: string | null
  }>(
    `SELECT
       id     AS "listingId",
       mls_id AS "mlsId",
       NULLIF(btrim(raw->>'ParcelNumber'), '') AS "parcelNumber",
       COALESCE(
         NULLIF(btrim(property_tax_year), ''),
         NULLIF(btrim(raw->>'TaxYear'), ''),
         NULLIF(btrim(data->>'propertyTaxYear'), '')
       ) AS "propertyTaxYear"
     FROM listings
     WHERE id = $1 OR mls_id = $1 OR listing_key = $1
     LIMIT 1`,
    [key],
  )
  return row ?? null
}

export async function readListingTaxHistoryFromDb(
  parcelNumber: string | null,
  listingId: string,
  limit = 5,
): Promise<ListingTaxHistoryRow[]> {
  const key = parcelNumber?.trim() || listingId.trim()
  if (!key) return []
  const rows = await query<{
    tax_year_end: number
    tax_year_label: string
    amount: unknown
  }>(
    `SELECT tax_year_end, tax_year_label, amount
       FROM listing_tax_history
      WHERE parcel_number = $1
      ORDER BY tax_year_end DESC
      LIMIT $2`,
    [key, Math.max(1, limit)],
  )
  return rows.map((row) => ({
    taxYearEnd: row.tax_year_end,
    taxYearLabel: row.tax_year_label,
    amount: numOrNull(row.amount) ?? 0,
  }))
}
