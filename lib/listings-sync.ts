import {
  getListingsDbStats,
  recordSyncRun,
  setSyncMeta,
  upsertTownListings,
} from '@/lib/listings-db'
import {
  CLOSED_LISTINGS_SINCE,
  COMING_SOON_MLS_STATUS,
  isClosedListing,
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
  statusBucket: 'Active' | 'Closed',
): Promise<TownSyncResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  const params: SearchParams = {
    city: town,
    status: statusBucket,
    limit: statusBucket === 'Closed' ? 2500 : 500,
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
    } else {
      listings = (await searchListings(params)).filter(isClosedListing)
    }
    const count = upsertTownListings(town, statusBucket, listings)
    if (statusBucket === 'Active' && count > 0) {
      setSyncedActiveCount(town, count)
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
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const towns: TownSyncResult[] = []

  for (const town of TMRE_TOWNS) {
    towns.push(await syncTownListings(town, 'Active'))
  }

  for (const town of TMRE_TOWNS) {
    towns.push(await syncTownListings(town, 'Closed'))
  }

  const finishedAt = new Date().toISOString()
  const totalUpserted = towns.reduce((sum, row) => sum + row.count, 0)
  const allOk = towns.every((row) => row.ok)

  if (allOk) {
    setSyncMeta('last_full_sync', finishedAt)
    try {
      const { rebuildStatsCache } = await import('@/lib/stats-cache')
      rebuildStatsCache()
    } catch (err) {
      console.error('[listings-sync] stats cache rebuild failed', err)
    }
    try {
      const { rebuildDealOfTheDayCache } = await import('@/lib/deal-of-the-day-cache')
      await rebuildDealOfTheDayCache()
    } catch (err) {
      console.error('[listings-sync] deal of the day cache rebuild failed', err)
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
}

export function getSyncStatus() {
  return getListingsDbStats()
}
