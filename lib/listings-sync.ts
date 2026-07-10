import {
  getListingsDbStats,
  getSyncMeta,
  publishListingsReadSnapshot,
  readListingsFromDb,
  recordSyncRun,
  setSyncMeta,
  upsertListingsIncremental,
  upsertTownListings,
} from '@/lib/listings-db'
import { beginSqliteRefresh, endSqliteRefresh } from '@/lib/sqlite-refresh-status'
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
  setSyncedActiveCount,
} from '@/lib/listings-store'
import { searchListings, type Listing, type SearchParams } from '@/lib/rets'
import { STATS_CLOSED_PERIOD_START } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

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

export type IncrementalSyncResult = FullSyncResult & {
  modifiedAfter: string
  mode: 'incremental'
}

const INCREMENTAL_OVERLAP_MS = 2 * 60 * 1000
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

export function shouldRunFullSync(): boolean {
  const last = getSyncMeta('last_full_sync')
  if (!last) return true
  const t = Date.parse(last)
  if (Number.isNaN(t)) return true
  return Date.now() - t > FULL_SYNC_INTERVAL_MS
}

function incrementalWatermark(): string {
  const lastIncremental = getSyncMeta('last_incremental_sync')
  const lastFull = getSyncMeta('last_full_sync')
  const raw = lastIncremental ?? lastFull
  if (raw) {
    const t = Date.parse(raw)
    if (!Number.isNaN(t)) {
      return new Date(t - INCREMENTAL_OVERLAP_MS).toISOString()
    }
  }
  // First incremental after a fresh DB — look back 24h only.
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
}

/** Pull only listings modified since the last incremental watermark. */
export async function syncTownListingsIncremental(
  town: TmreTown,
  modifiedAfter: string,
): Promise<TownSyncResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  try {
    const limit = ACTIVE_LISTINGS_FETCH_LIMIT
    const [active, comingSoon] = await Promise.all([
      searchMarketListingsForTown(town, 'Active', limit, { modifiedAfter }),
      searchMarketListingsForTown(town, COMING_SOON_MLS_STATUS, limit, {
        modifiedAfter,
      }).catch(() => [] as Listing[]),
    ])
    const listings = mergeSyncListings(active, comingSoon)
    const { count, priceChangedIds } = upsertListingsIncremental(
      town,
      'Active',
      listings,
    )

    if (priceChangedIds.length > 0) {
      try {
        const { rescoreListingsByIds } = await import('@/lib/listing-scores-rebuild')
        await rescoreListingsByIds(town, priceChangedIds)
      } catch (err) {
        console.error(`[listings-sync/incremental] ${town} price rescore failed`, err)
      }
    }

    const finishedAt = new Date().toISOString()
    recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket: 'Active/incremental',
      listingsCount: count,
      ok: true,
    })
    return {
      town,
      statusBucket: 'Active/incremental',
      count,
      ok: true,
      durationMs: Date.now() - t0,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const finishedAt = new Date().toISOString()
    recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket: 'Active/incremental',
      listingsCount: 0,
      ok: false,
      error: message,
    })
    console.error(`[listings-sync/incremental] ${town} failed`, err)
    return {
      town,
      statusBucket: 'Active/incremental',
      count: 0,
      ok: false,
      error: message,
      durationMs: Date.now() - t0,
    }
  }
}

/** Incremental sync across all towns — no bucket deletions (use full sync for reconcile). */
export async function syncIncrementalListings(): Promise<IncrementalSyncResult> {
  if (getSyncMeta('refresh_in_progress') === '1') {
    console.info('[listings-sync/incremental] skipped — refresh already in progress')
    const now = new Date().toISOString()
    return {
      mode: 'incremental',
      modifiedAfter: incrementalWatermark(),
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      towns: [],
      totalUpserted: 0,
    }
  }

  const modifiedAfter = incrementalWatermark()
  const startedAt = new Date().toISOString()
  setSyncMeta('last_incremental_sync_started', startedAt)
  const t0 = Date.now()
  const towns: TownSyncResult[] = []

  beginSqliteRefresh('incremental')

  try {
    for (const town of TMRE_TOWNS) {
      towns.push(await syncTownListingsIncremental(town, modifiedAfter))
      await yieldToEventLoop()
    }

    const finishedAt = new Date().toISOString()
    const totalUpserted = towns.reduce((sum, row) => sum + row.count, 0)
    const allOk = towns.every((row) => row.ok)

    if (allOk) {
      publishListingsReadSnapshot()
      setSyncMeta('last_incremental_sync', finishedAt)
      // Town feeds for /latest — bounded hero thumbnails warm chained inside rebuild.
      try {
        const { warmLatestTownFeedsDeferred } = await import('@/lib/latest-town-feed-cache')
        warmLatestTownFeedsDeferred()
      } catch (err) {
        console.warn('[listings-sync/incremental] town feed warm schedule failed', err)
      }
      try {
        const { warmIntelligenceDealBoardDeferred } = await import(
          '@/lib/intelligence-deal-board-cache'
        )
        warmIntelligenceDealBoardDeferred()
      } catch (err) {
        console.warn('[listings-sync/incremental] intelligence board warm schedule failed', err)
      }
    }

    console.info(
      `[listings-sync/incremental] complete in ${Date.now() - t0}ms — ${totalUpserted} upserts since ${modifiedAfter}`,
    )

    return {
      mode: 'incremental',
      modifiedAfter,
      startedAt,
      finishedAt,
      durationMs: Date.now() - t0,
      towns,
      totalUpserted,
    }
  } finally {
    endSqliteRefresh(new Date().toISOString())
  }
}

/** Full sync when stale; otherwise incremental. */
export async function syncListingsSmart(): Promise<FullSyncResult | IncrementalSyncResult> {
  if (shouldRunFullSync()) {
    console.info('[listings-sync] running scheduled full sync')
    return syncAllTownListings()
  }
  return syncIncrementalListings()
}

const CLOSED_SINCE = CLOSED_LISTINGS_SINCE

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yieldToEventLoop(): Promise<void> {
  return sleep(0)
}

let photoWarmRunning = false

/** Warm photo blobs after listings sync — runs outside the refresh lock. */
async function warmActiveListingPhotosDeferred(): Promise<void> {
  if (photoWarmRunning) return
  photoWarmRunning = true
  try {
    await sleep(2_000)
    const { syncListingPhotosForListings } = await import('@/lib/listing-photos-sync')
    for (const town of TMRE_TOWNS) {
      const listings = readListingsFromDb(town, 'Active', ACTIVE_LISTINGS_FETCH_LIMIT)
      if (listings.length === 0) continue
      await syncListingPhotosForListings(listings, { concurrency: 1 })
      await sleep(100)
    }
  } catch (err) {
    console.error('[listings-sync] deferred photo warm failed', err)
  } finally {
    photoWarmRunning = false
  }
}

function mergeSyncListings(a: Listing[], b: Listing[]): Listing[] {
  const seen = new Set<string>()
  const merged: Listing[] = []
  for (const l of [...a, ...b]) {
    const key = l.listingKey || l.mlsId
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(l)
  }
  return merged
}

/** Comparables + stats charts only use closed sales since this calendar year. */
const RECENT_CLOSED_SINCE = `${STATS_CLOSED_PERIOD_START}-01-01`

/**
 * Pull closed sales for one town. RETS search is capped at 2500 rows and returns
 * oldest status changes first, so high-volume towns miss recent closes unless we
 * always merge an explicit recent window (2024+).
 */
async function fetchClosedListingsForTown(
  town: TmreTown,
  limit: number,
): Promise<Listing[]> {
  const bulkParams: SearchParams = {
    city: town,
    status: 'Closed',
    limit,
    closedAfter: CLOSED_SINCE,
  }
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
  return mergeSyncListings(
    recent.filter(isClosedListing),
    bulk.filter(isClosedListing),
  )
}

/** Pull one town/status bucket from RETS and upsert into SQLite. */
export async function syncTownListings(
  town: TmreTown,
  statusBucket: 'Active' | 'Closed' | 'Expired',
  options: { syncPhotos?: boolean } = {},
): Promise<TownSyncResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  const params: SearchParams = {
    city: town,
    status: statusBucket,
    limit:
      statusBucket === 'Closed'
        ? CLOSED_LISTINGS_FETCH_LIMIT
        : statusBucket === 'Expired'
          ? EXPIRED_LISTINGS_FETCH_LIMIT
          : ACTIVE_LISTINGS_FETCH_LIMIT,
  }
  if (statusBucket === 'Closed') {
    params.closedAfter = CLOSED_SINCE
  }

  try {
    let listings: Listing[]
    if (statusBucket === 'Active') {
      const limit = params.limit ?? 500
      const [active, comingSoon] = await Promise.all([
        searchMarketListingsForTown(town, 'Active', limit),
        searchMarketListingsForTown(town, COMING_SOON_MLS_STATUS, limit).catch(
          () => [] as Listing[],
        ),
      ])
      listings = mergeSyncListings(active, comingSoon)
    } else if (statusBucket === 'Expired') {
      listings = await searchExpiredListingsForTown(town, EXPIRED_LISTINGS_FETCH_LIMIT)
      listings = listings.filter(isExpiredListing)
    } else {
      listings = await fetchClosedListingsForTown(
        town,
        params.limit ?? CLOSED_LISTINGS_FETCH_LIMIT,
      )
    }
    const count = upsertTownListings(town, statusBucket, listings)
    if (statusBucket === 'Active' && count > 0) {
      setSyncedActiveCount(town, count)
      if (options.syncPhotos !== false) {
        try {
          const { syncListingPhotosForListings } = await import('@/lib/listing-photos-sync')
          const photoSync = await syncListingPhotosForListings(listings, { concurrency: 2 })
          if (photoSync.photos > 0) {
            console.info(
              `[listings-sync] ${town} Active photos cached: ${photoSync.photos} images across ${photoSync.listings} listings`,
            )
          }
        } catch (err) {
          console.error(`[listings-sync] ${town} Active photo sync failed`, err)
        }
      }
    }
    const finishedAt = new Date().toISOString()
    recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket,
      listingsCount: count,
      ok: true,
    })
    return {
      town,
      statusBucket,
      count,
      ok: true,
      durationMs: Date.now() - t0,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const finishedAt = new Date().toISOString()
    recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket,
      listingsCount: 0,
      ok: false,
      error: message,
    })
    console.error(`[listings-sync] ${town} ${statusBucket} failed`, err)
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

/** Iteratively sync every TMRE town — Active first, then Closed sales since 2019. */
export async function syncAllTownListings(): Promise<FullSyncResult> {
  if (getSyncMeta('refresh_in_progress') === '1') {
    console.info('[listings-sync] skipped — refresh already in progress')
    const now = new Date().toISOString()
    return {
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      towns: [],
      totalUpserted: 0,
    }
  }

  const startedAt = new Date().toISOString()
  setSyncMeta('last_full_sync_started', startedAt)
  const t0 = Date.now()
  const towns: TownSyncResult[] = []

  beginSqliteRefresh('full-sync')

  try {
  for (const town of TMRE_TOWNS) {
    towns.push(await syncTownListings(town, 'Active', { syncPhotos: false }))
    await yieldToEventLoop()
  }

  for (const town of TMRE_TOWNS) {
    towns.push(await syncTownListings(town, 'Closed', { syncPhotos: false }))
    await yieldToEventLoop()
  }

  for (const town of TMRE_TOWNS) {
    towns.push(await syncTownListings(town, 'Expired', { syncPhotos: false }))
    await yieldToEventLoop()
  }

  const finishedAt = new Date().toISOString()
  const totalUpserted = towns.reduce((sum, row) => sum + row.count, 0)
  const allOk = towns.every((row) => row.ok)

  if (allOk) {
    publishListingsReadSnapshot()
    setSyncMeta('last_full_sync', finishedAt)
    try {
      const { rebuildAllListingScores } = await import('@/lib/listing-scores-rebuild')
      await rebuildAllListingScores()
    } catch (err) {
      console.error('[listings-sync] listing scores rebuild failed', err)
    }
    try {
      const { rebuildStatsCache } = await import('@/lib/stats-cache')
      rebuildStatsCache({ trackRefresh: false })
    } catch (err) {
      console.error('[listings-sync] stats cache rebuild failed', err)
    }
    try {
      const { rebuildDealOfTheDayCache } = await import('@/lib/deal-of-the-day-cache')
      await rebuildDealOfTheDayCache()
    } catch (err) {
      console.error('[listings-sync] deal of the day cache rebuild failed', err)
    }
    try {
      const { rebuildDealOfTheWeekCache } = await import('@/lib/deal-of-the-week-cache')
      await rebuildDealOfTheWeekCache()
    } catch (err) {
      console.error('[listings-sync] deal of the week cache rebuild failed', err)
    }
    try {
      const { rebuildSpotlightCache } = await import('@/lib/spotlight-cache')
      await rebuildSpotlightCache()
    } catch (err) {
      console.error('[listings-sync] spotlight cache rebuild failed', err)
    }
    try {
      const { rebuildListingIfEstimates } = await import('@/lib/listing-if-compute')
      rebuildListingIfEstimates()
    } catch (err) {
      console.error('[listings-sync] If estimates cache rebuild failed', err)
    }
    try {
      const { warmComparableEdgesDeferred } = await import(
        '@/lib/listing-comparables-cache'
      )
      warmComparableEdgesDeferred()
    } catch (err) {
      console.error('[listings-sync] comps edges warm schedule failed', err)
    }
    try {
      const { rebuildAllListingEdgeScores } = await import('@/lib/listing-edge-score')
      rebuildAllListingEdgeScores()
    } catch (err) {
      console.error('[listings-sync] edge scores rebuild failed', err)
    }
    try {
      const { warmLatestTownFeedsDeferred } = await import('@/lib/latest-town-feed-cache')
      warmLatestTownFeedsDeferred()
    } catch (err) {
      console.error('[listings-sync] Latest town feed warm schedule failed', err)
    }
    try {
      const { warmIntelligenceDealBoardDeferred } = await import(
        '@/lib/intelligence-deal-board-cache'
      )
      warmIntelligenceDealBoardDeferred()
    } catch (err) {
      console.error('[listings-sync] Intelligence deal board warm schedule failed', err)
    }
  }

  console.info(
    `[listings-sync] complete in ${Date.now() - t0}ms — ${totalUpserted} listings across ${TMRE_TOWNS.length} towns`,
  )

  return {
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    towns,
    totalUpserted,
  }
  } finally {
    endSqliteRefresh(new Date().toISOString())
    void warmActiveListingPhotosDeferred()
  }
}

export function getSyncStatus() {
  return getListingsDbStats()
}
