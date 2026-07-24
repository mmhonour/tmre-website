import 'server-only'

import {
  recordSyncRun,
  upsertListingsIncremental,
  upsertTownListings,
} from '@/lib/db/listings-repo'
import {
  ACTIVE_LISTINGS_FETCH_LIMIT,
  CLOSED_LISTINGS_FETCH_LIMIT,
  CLOSED_LISTINGS_SINCE,
  COMING_SOON_MLS_STATUS,
  EXPIRED_LISTINGS_FETCH_LIMIT,
  isClosedListing,
  isExpiredListing,
  searchExpiredListingsForTown,
  searchMarketListingsForTown,
  UNDER_CONTRACT_CTS_MLS_STATUS,
  UNDER_CONTRACT_MLS_STATUS,
} from '@/lib/listings-store'
import {
  isRetsConfigured,
  searchListings,
  type Listing,
  type SearchParams,
} from '@/lib/rets'
import { STATS_CLOSED_PERIOD_START } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

// ---------------------------------------------------------------------------
// Postgres sync orchestration — Phase 3 of the SQLite → Postgres move.
//
// This is the RETS → Postgres port of lib/listings-sync.ts's per-town/bucket
// fetch-and-upsert path. It intentionally has NONE of the SQLite-era machinery:
//   * no blob checkpoint / WAL / read-snapshot publish (Postgres is durable +
//     transactional; every upsert is immediately visible to all readers)
//   * no chunked finalize / resumable steps (that existed only to fit a
//     multi-hundred-MB SQLite file into a Lambda's /tmp and time budget)
//   * no refresh-lock / degraded-DB guards (no shared file to corrupt)
//
// The RETS fetch helpers are reused verbatim from lib/listings-store (the same
// functions the SQLite path calls), so pull behavior is identical — only the
// persistence target changes. The two tiny pure helpers below mirror the ones
// local to lib/listings-sync.ts.
// ---------------------------------------------------------------------------

export type TownSyncResult = {
  town: TmreTown
  statusBucket: string
  count: number
  ok: boolean
  error?: string
  durationMs: number
}

export type FullSyncResult = {
  startedAt: string
  finishedAt: string
  durationMs: number
  towns: TownSyncResult[]
  totalUpserted: number
}

type StatusBucket = 'Active' | 'Closed' | 'Expired'

const CLOSED_SINCE = CLOSED_LISTINGS_SINCE
/** Comparables + stats charts only use closed sales since this calendar year. */
const RECENT_CLOSED_SINCE = `${STATS_CLOSED_PERIOD_START}-01-01`

/** Dedupe by listingKey||mlsId, first occurrence wins. Mirrors listings-sync.ts. */
function mergeSyncListings(...groups: Listing[][]): Listing[] {
  const seen = new Set<string>()
  const merged: Listing[] = []
  for (const group of groups) {
    for (const l of group) {
      const key = l.listingKey || l.mlsId
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(l)
    }
  }
  return merged
}

/**
 * Pull closed sales for one town. RETS caps at 2500 rows oldest-first, so we
 * always merge an explicit recent window (2024+) with the bulk window. Mirrors
 * lib/listings-sync.ts fetchClosedListingsForTown.
 */
async function fetchClosedListingsForTown(town: TmreTown, limit: number): Promise<Listing[]> {
  const bulkParams: SearchParams = { city: town, status: 'Closed', limit, closedAfter: CLOSED_SINCE }
  const recentParams: SearchParams = {
    city: town,
    status: 'Closed',
    limit,
    closedAfter: RECENT_CLOSED_SINCE,
  }
  const [recent, bulk] = await Promise.all([
    searchListings(recentParams).catch(() => [] as Listing[]),
    searchListings(bulkParams).catch(() => [] as Listing[]),
  ])
  return mergeSyncListings(recent.filter(isClosedListing), bulk.filter(isClosedListing))
}

/** Fetch one town/bucket from RETS (identical pull logic to the SQLite path). */
async function fetchTownBucket(town: TmreTown, statusBucket: StatusBucket): Promise<Listing[]> {
  if (statusBucket === 'Active') {
    const limit = ACTIVE_LISTINGS_FETCH_LIMIT
    const [active, comingSoon, underContract, underContractCts] =
      await Promise.all([
        searchMarketListingsForTown(town, 'Active', limit),
        searchMarketListingsForTown(town, COMING_SOON_MLS_STATUS, limit).catch(
          () => [] as Listing[],
        ),
        searchMarketListingsForTown(town, UNDER_CONTRACT_MLS_STATUS, limit).catch(
          () => [] as Listing[],
        ),
        searchMarketListingsForTown(
          town,
          UNDER_CONTRACT_CTS_MLS_STATUS,
          limit,
        ).catch(() => [] as Listing[]),
      ])
    return mergeSyncListings(
      active,
      comingSoon,
      underContract,
      underContractCts,
    )
  }
  if (statusBucket === 'Expired') {
    const listings = await searchExpiredListingsForTown(town, EXPIRED_LISTINGS_FETCH_LIMIT)
    return listings.filter(isExpiredListing)
  }
  return fetchClosedListingsForTown(town, CLOSED_LISTINGS_FETCH_LIMIT)
}

/**
 * Full sync of one town/bucket into Postgres: fetch from RETS, upsert the pool
 * (with delisted-row reconciliation), record the run. Never throws — failures
 * are captured in the returned result and the sync_runs audit row.
 */
export async function syncTownListingsPg(
  town: TmreTown,
  statusBucket: StatusBucket,
): Promise<TownSyncResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  try {
    const listings = await fetchTownBucket(town, statusBucket)
    const result = await upsertTownListings(town, statusBucket, listings)
    const finishedAt = new Date().toISOString()

    await recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket,
      listingsCount: result.seen,
      ok: true,
    })

    return {
      town,
      statusBucket,
      count: result.seen,
      ok: true,
      durationMs: Date.now() - t0,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const finishedAt = new Date().toISOString()
    await recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket,
      listingsCount: 0,
      ok: false,
      error: message,
    })
    console.error(`[listings-sync-pg] ${town} ${statusBucket} failed`, err)
    return {
      town,
      statusBucket,
      count: 0,
      ok: false,
      error: message,
      durationMs: Date.now() - t0,
    }
  }
}

const ALL_BUCKETS: StatusBucket[] = ['Active', 'Closed', 'Expired']

/** Full resync of every town × bucket into Postgres. */
export async function syncAllTownListingsPg(
  options: { towns?: readonly TmreTown[]; buckets?: readonly StatusBucket[] } = {},
): Promise<FullSyncResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  if (!isRetsConfigured()) {
    console.info('[listings-sync-pg] skipped full sync — RETS not configured')
    return { startedAt, finishedAt: startedAt, durationMs: 0, towns: [], totalUpserted: 0 }
  }

  const towns = options.towns ?? TMRE_TOWNS
  const buckets = options.buckets ?? ALL_BUCKETS
  const results: TownSyncResult[] = []

  for (const town of towns) {
    for (const bucket of buckets) {
      results.push(await syncTownListingsPg(town, bucket))
    }
  }

  const finishedAt = new Date().toISOString()
  const totalUpserted = results.reduce((sum, r) => sum + r.count, 0)
  console.info(
    `[listings-sync-pg] complete in ${Date.now() - t0}ms — ${totalUpserted} listings across ${towns.length} towns`,
  )

  return { startedAt, finishedAt, durationMs: Date.now() - t0, towns: results, totalUpserted }
}

/**
 * Incremental sync of one town/bucket: upsert only the listings modified since
 * `modifiedAfter`, without deleting the rest of the pool. Returns changed count
 * and the ids whose price moved (for downstream re-scoring at cutover).
 */
export async function syncTownIncrementalPg(
  town: TmreTown,
  statusBucket: StatusBucket,
  modifiedAfter: string,
): Promise<{ count: number; priceChangedIds: string[] }> {
  if (statusBucket === 'Active') {
    const limit = ACTIVE_LISTINGS_FETCH_LIMIT
    const [active, comingSoon, underContract, underContractCts] =
      await Promise.all([
        searchMarketListingsForTown(town, 'Active', limit, { modifiedAfter }),
        searchMarketListingsForTown(town, COMING_SOON_MLS_STATUS, limit, {
          modifiedAfter,
        }).catch(() => [] as Listing[]),
        searchMarketListingsForTown(town, UNDER_CONTRACT_MLS_STATUS, limit, {
          modifiedAfter,
        }).catch(() => [] as Listing[]),
        searchMarketListingsForTown(
          town,
          UNDER_CONTRACT_CTS_MLS_STATUS,
          limit,
          { modifiedAfter },
        ).catch(() => [] as Listing[]),
      ])
    const listings = mergeSyncListings(
      active,
      comingSoon,
      underContract,
      underContractCts,
    )
    return upsertListingsIncremental(town, 'Active', listings)
  }

  const params: SearchParams = {
    city: town,
    status: statusBucket,
    modifiedAfter,
    limit:
      statusBucket === 'Closed'
        ? CLOSED_LISTINGS_FETCH_LIMIT
        : statusBucket === 'Expired'
          ? EXPIRED_LISTINGS_FETCH_LIMIT
          : ACTIVE_LISTINGS_FETCH_LIMIT,
  }
  if (statusBucket === 'Closed') params.closedAfter = CLOSED_SINCE
  const listings = await searchListings(params)
  return upsertListingsIncremental(town, statusBucket, listings)
}
