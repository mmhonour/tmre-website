import {
  getListingsDbStats,
  getSyncMeta,
  publishListingsReadSnapshot,
  readListingsFromDb,
  recordSyncRun,
  setSyncMeta,
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
      listings = (await searchListings(params)).filter(isClosedListing)
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

/** Iteratively sync every TMRE town — Active first, then Closed sales since 2024. */
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
  const t0 = Date.now()
  const towns: TownSyncResult[] = []

  beginSqliteRefresh()

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
