import {
  captureInventorySnapshot,
  countListings,
  readListingsDbStats,
  readListingsFromDb,
  recordSyncRun,
  upsertListingsIncremental,
  upsertTownListings,
} from '@/lib/db/listings-repo'
import { deleteSyncMeta, getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
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
import { isRetsConfigured, retsSyncBlockedMessage } from '@/lib/rets'
import { STATS_CLOSED_PERIOD_START } from '@/lib/stats-listing-rows'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'
import { isServerlessRuntime } from '@/lib/runtime-host'
import type { FullResyncFinalizeStepId } from '@/lib/admin-sync-types'

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
    const { count, priceChangedIds } = await upsertListingsIncremental(
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
    await recordSyncRun({
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
    await recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket: 'Active/incremental',
      listingsCount: 0,
      ok: false,
      error: message,
    })
    console.error(`[listings-sync/incremental] ${town} failed`, err)
    void import('@/lib/rets-health').then(({ recordRetsFailureFromSyncError }) =>
      recordRetsFailureFromSyncError(err),
    )
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
  if (!isRetsConfigured()) {
    const now = new Date().toISOString()
    console.info('[listings-sync/incremental] skipped — RETS not configured')
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
  deleteSyncMeta('last_incremental_sync')
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

    setSyncMeta('last_incremental_sync', finishedAt)
    if (allOk) {
      // Town feeds for /latest — bounded hero thumbnails warm chained inside rebuild.
      try {
        const { warmLatestTownFeedsDeferred } = await import('@/lib/latest-town-feed-cache')
        warmLatestTownFeedsDeferred()
      } catch (err) {
        console.warn('[listings-sync/incremental] town feed warm schedule failed', err)
      }
      // Rebuild the intelligence board synchronously so the result lands in stats_cache.
      try {
        const { rebuildIntelligenceDealBoardCache } = await import(
          '@/lib/intelligence-deal-board-cache'
        )
        await rebuildIntelligenceDealBoardCache()
      } catch (err) {
        console.warn('[listings-sync/incremental] intelligence board rebuild failed (non-fatal):', err)
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
  if (!isRetsConfigured()) {
    console.info('[listings-sync] skipped — RETS not configured')
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
  if (shouldRunFullSync()) {
    if (isServerlessRuntime()) {
      console.info(
        '[listings-sync] serverless — skipping monolithic full sync (use admin chunked resync)',
      )
      return syncIncrementalListings()
    }
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

/**
 * Warm Active-inventory photo blobs into the photo store (R2 or SQLite backend).
 * Awaitable + guarded so callers get deterministic completion (CLI backfill) and
 * concurrent invocations can't race. Returns per-run totals.
 */
export async function warmActiveListingPhotos(options: {
  concurrency?: number
} = {}): Promise<{ listings: number; photos: number }> {
  if (photoWarmRunning) return { listings: 0, photos: 0 }
  photoWarmRunning = true
  const concurrency = options.concurrency ?? 1
  let totalListings = 0
  let totalPhotos = 0
  try {
    const { syncListingPhotosForListings } = await import('@/lib/listing-photos-sync')
    for (const town of TMRE_TOWNS) {
      const listings = await readListingsFromDb(town, 'Active', ACTIVE_LISTINGS_FETCH_LIMIT)
      if (listings.length === 0) continue
      const res = await syncListingPhotosForListings(listings, {
        concurrency,
        progressLabel: town,
      })
      totalListings += res.listings
      totalPhotos += res.photos
      console.info(
        `[listings-sync] ${town} photo warm: ${res.photos} images across ${res.listings} listings`,
      )
      await sleep(100)
    }
  } finally {
    photoWarmRunning = false
  }
  return { listings: totalListings, photos: totalPhotos }
}

/** Fire-and-forget photo warm for the long-lived server (runs outside the refresh lock). */
async function warmActiveListingPhotosDeferred(): Promise<void> {
  if (photoWarmRunning) return
  try {
    await sleep(2_000)
    if (photoWarmRunning) return
    await warmActiveListingPhotos({ concurrency: 1 })
  } catch (err) {
    console.error('[listings-sync] deferred photo warm failed', err)
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

/** Pull one town/status bucket from RETS and upsert into Postgres. */
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
    const result = await upsertTownListings(town, statusBucket, listings)
    const count = result.seen
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
    await recordSyncRun({
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
    await recordSyncRun({
      startedAt,
      finishedAt,
      town,
      statusBucket,
      listingsCount: 0,
      ok: false,
      error: message,
    })
    console.error(`[listings-sync] ${town} ${statusBucket} failed`, err)
    void import('@/lib/rets-health').then(({ recordRetsFailureFromSyncError }) =>
      recordRetsFailureFromSyncError(err),
    )
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

/**
 * Individual finalize sub-tasks — each one maps 1:1 to a `FullResyncFinalizeStepId` so the
 * chunked path (`runFullResyncFinalizeStep`) can run exactly one per HTTP request, while the
 * monolithic path (`applyFullSyncPostamble`) still runs all of them in one call for non-serverless
 * hosts. Unlike the monolithic wrapper, these throw on failure — the chunked dispatcher surfaces
 * the error to the admin panel instead of swallowing it.
 */
async function finalizeStepScores(finishedAt: string): Promise<void> {
  setSyncMeta('last_full_sync', finishedAt)
  const { rebuildAllListingScores } = await import('@/lib/listing-scores-rebuild')
  await rebuildAllListingScores()
}

async function finalizeStepSuperlatives(): Promise<void> {
  const { rebuildAllListingSuperlatives } = await import('@/lib/listing-superlatives-rebuild')
  await rebuildAllListingSuperlatives()
}

async function finalizeStepStatsCache(): Promise<void> {
  const { rebuildStatsCache } = await import('@/lib/stats-cache')
  await rebuildStatsCache({ trackRefresh: false })
}

async function finalizeStepDealOfDay(): Promise<void> {
  const { rebuildDealOfTheDayCache } = await import('@/lib/deal-of-the-day-cache')
  await rebuildDealOfTheDayCache()
}

async function finalizeStepDealOfWeek(): Promise<void> {
  const { rebuildDealOfTheWeekCache } = await import('@/lib/deal-of-the-week-cache')
  await rebuildDealOfTheWeekCache()
}

async function finalizeStepSpotlight(): Promise<void> {
  const { rebuildSpotlightCache } = await import('@/lib/spotlight-cache')
  const { SPOTLIGHT_PROPERTY_TABS } = await import('@/lib/spotlight-listing')
  for (const tab of SPOTLIGHT_PROPERTY_TABS) {
    await rebuildSpotlightCache(tab)
  }
}

async function finalizeStepIfEstimates(): Promise<void> {
  const { rebuildListingIfEstimates } = await import('@/lib/listing-if-compute')
  await rebuildListingIfEstimates()
}

async function finalizeStepEdgeScores(): Promise<void> {
  const { rebuildAllListingEdgeScores } = await import('@/lib/listing-edge-score')
  await rebuildAllListingEdgeScores()
}

/** Already-deferred/fire-and-forget warms — kept fire-and-forget, just triggered from the last step. */
async function triggerFullResyncDeferredWarms(): Promise<void> {
  try {
    const { warmComparableEdgesDeferred } = await import('@/lib/listing-comparables-cache')
    warmComparableEdgesDeferred()
  } catch (err) {
    console.error('[listings-sync] comps edges warm schedule failed', err)
  }
  try {
    const { warmLatestTownFeedsDeferred } = await import('@/lib/latest-town-feed-cache')
    warmLatestTownFeedsDeferred()
  } catch (err) {
    console.error('[listings-sync] Latest town feed warm schedule failed', err)
  }
  // Intelligence board is rebuilt synchronously in finalizeStepPersist and
  // syncIncrementalListings so the result lands in stats_cache.
}

/** Final bookkeeping — mirrors what `finalizeChunkedFullResync()`'s finally used to run. */
async function finalizeStepPersist(finishedAt: string): Promise<{ totalListings: number }> {
  try {
    const { rebuildIntelligenceDealBoardCache } = await import(
      '@/lib/intelligence-deal-board-cache'
    )
    await rebuildIntelligenceDealBoardCache()
  } catch (err) {
    console.warn('[listings-sync] finalizeStepPersist: intelligence board rebuild failed (non-fatal):', err)
  }
  await triggerFullResyncDeferredWarms()
  const { markPostDeployFullResyncComplete } = await import('@/lib/deploy-full-resync-schedule')
  markPostDeployFullResyncComplete()
  const totalListings = await countListings()
  await captureInventorySnapshot()
  endSqliteRefresh(finishedAt)
  const { clearChunkedFullResyncProgress } = await import('@/lib/db/chunked-resync-progress')
  await clearChunkedFullResyncProgress()
  void warmActiveListingPhotosDeferred()
  return { totalListings }
}

/** Post–town-loop cache rebuilds and read snapshot (monolithic full sync only). */
async function applyFullSyncPostamble(finishedAt: string): Promise<void> {
  try {
    await finalizeStepScores(finishedAt)
  } catch (err) {
    console.error('[listings-sync] listing scores rebuild failed', err)
  }
  try {
    await finalizeStepSuperlatives()
  } catch (err) {
    console.error('[listings-sync] listing superlatives rebuild failed', err)
  }
  try {
    await finalizeStepStatsCache()
  } catch (err) {
    console.error('[listings-sync] stats cache rebuild failed', err)
  }
  try {
    await finalizeStepDealOfDay()
  } catch (err) {
    console.error('[listings-sync] deal of the day cache rebuild failed', err)
  }
  try {
    await finalizeStepDealOfWeek()
  } catch (err) {
    console.error('[listings-sync] deal of the week cache rebuild failed', err)
  }
  try {
    await finalizeStepSpotlight()
  } catch (err) {
    console.error('[listings-sync] spotlight cache rebuild failed', err)
  }
  try {
    await finalizeStepIfEstimates()
  } catch (err) {
    console.error('[listings-sync] If estimates cache rebuild failed', err)
  }
  try {
    await finalizeStepEdgeScores()
  } catch (err) {
    console.error('[listings-sync] edge scores rebuild failed', err)
  }
  try {
    const { rebuildIntelligenceDealBoardCache } = await import('@/lib/intelligence-deal-board-cache')
    await rebuildIntelligenceDealBoardCache()
  } catch (err) {
    console.error('[listings-sync] intelligence board rebuild failed (non-fatal):', err)
  }
  await triggerFullResyncDeferredWarms()
}

export type FinalizeStepResult = {
  step: FullResyncFinalizeStepId
  ok: boolean
  error?: string
  durationMs: number
  /** Only set once the last ('persist') step completes. */
  totalListings?: number
}

/**
 * One finalize step of a chunked full resync (mirrors `syncFullResyncTown` for the town phase).
 * Each step should comfortably complete within a single serverless invocation. Errors are caught
 * here (rather than swallowed like `applyFullSyncPostamble` does) so the admin panel can surface
 * exactly which step failed and let the client retry from there.
 */
export async function runFullResyncFinalizeStep(
  step: FullResyncFinalizeStepId,
): Promise<FinalizeStepResult> {
  const t0 = Date.now()
  const finishedAt = new Date().toISOString()
  try {
    switch (step) {
      case 'scores':
        await finalizeStepScores(finishedAt)
        break
      case 'superlatives':
        await finalizeStepSuperlatives()
        break
      case 'stats-cache':
        await finalizeStepStatsCache()
        break
      case 'deal-of-day':
        await finalizeStepDealOfDay()
        break
      case 'deal-of-week':
        await finalizeStepDealOfWeek()
        break
      case 'spotlight':
        await finalizeStepSpotlight()
        break
      case 'if-estimates':
        await finalizeStepIfEstimates()
        break
      case 'edge-scores':
        await finalizeStepEdgeScores()
        break
      case 'persist': {
        const { totalListings } = await finalizeStepPersist(finishedAt)
        return { step, ok: true, durationMs: Date.now() - t0, totalListings }
      }
      default: {
        const _exhaustive: never = step
        return _exhaustive
      }
    }
    return { step, ok: true, durationMs: Date.now() - t0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[listings-sync] finalize step "${step}" failed`, err)
    return { step, ok: false, error: message, durationMs: Date.now() - t0 }
  }
}

/** Active + Closed + Expired for a single town (no refresh lock). */
async function syncFullResyncTownBuckets(town: TmreTown): Promise<TownSyncResult[]> {
  const results: TownSyncResult[] = []
  results.push(await syncTownListings(town, 'Active', { syncPhotos: false }))
  await yieldToEventLoop()
  results.push(await syncTownListings(town, 'Closed', { syncPhotos: false }))
  await yieldToEventLoop()
  results.push(await syncTownListings(town, 'Expired', { syncPhotos: false }))
  return results
}

/** One town step of a chunked full resync (opens refresh lock on first town). */
export async function syncFullResyncTown(town: TmreTown): Promise<TownSyncResult[]> {
  if (!isRetsConfigured()) {
    throw new Error(retsSyncBlockedMessage())
  }
  if (getSyncMeta('refresh_in_progress') !== '1') {
    beginSqliteRefresh('full-sync-chunked')
    setSyncMeta('last_full_sync_started', new Date().toISOString())
    deleteSyncMeta('last_full_sync')
    const { clearChunkedFullResyncProgress } = await import('@/lib/db/chunked-resync-progress')
    await clearChunkedFullResyncProgress()
  }
  const results = await syncFullResyncTownBuckets(town)
  return results
}

/** Finalize caches after client-driven town-by-town full resync. */
export async function finalizeChunkedFullResync(): Promise<FullSyncResult> {
  const startedAt = getSyncMeta('last_full_sync_started') ?? new Date().toISOString()
  const t0 = Date.parse(startedAt)
  const finishedAt = new Date().toISOString()

  try {
    await applyFullSyncPostamble(finishedAt)
    const { markPostDeployFullResyncComplete } = await import('@/lib/deploy-full-resync-schedule')
    markPostDeployFullResyncComplete()
    const total = await countListings()
    await captureInventorySnapshot()
    const { clearChunkedFullResyncProgress } = await import('@/lib/db/chunked-resync-progress')
    await clearChunkedFullResyncProgress()
    console.info(
      `[listings-sync] chunked full resync complete in ${Date.now() - t0}ms — ${total} listings`,
    )
    return {
      startedAt,
      finishedAt,
      durationMs: Number.isNaN(t0) ? 0 : Date.now() - t0,
      towns: [],
      totalUpserted: total,
    }
  } finally {
    endSqliteRefresh(finishedAt)
    void warmActiveListingPhotosDeferred()
  }
}

/** Iteratively sync every TMRE town — Active first, then Closed sales since 2019. */
export async function syncAllTownListings(): Promise<FullSyncResult> {
  if (!isRetsConfigured()) {
    const now = new Date().toISOString()
    console.info('[listings-sync] skipped full sync — RETS not configured')
    return {
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      towns: [],
      totalUpserted: 0,
    }
  }

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
  deleteSyncMeta('last_full_sync')
  const t0 = Date.now()
  const towns: TownSyncResult[] = []

  beginSqliteRefresh('full-sync')

  try {
  for (const town of TMRE_TOWNS) {
    towns.push(...(await syncFullResyncTownBuckets(town)))
    await yieldToEventLoop()
  }

  const finishedAt = new Date().toISOString()
  const totalUpserted = towns.reduce((sum, row) => sum + row.count, 0)
  const allOk = towns.every((row) => row.ok)

  if (allOk) {
    await applyFullSyncPostamble(finishedAt)
    const { markPostDeployFullResyncComplete } = await import('@/lib/deploy-full-resync-schedule')
    markPostDeployFullResyncComplete()
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

export async function getSyncStatus() {
  return readListingsDbStats()
}
