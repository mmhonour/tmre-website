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
