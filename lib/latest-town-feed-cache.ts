import 'server-only'

import {
  fetchLatestUpdatedListings,
  type LatestListingRow,
} from '@/lib/latest-listings'
import { publishListingsReadSnapshot } from '@/lib/listings-db'
import { setSyncMeta } from '@/lib/db/sync-meta-store'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'
import { readLatestGlobalFeedCache } from '@/lib/latest-feed-cache'
import { warmLatestHeroPhotosDeferred } from '@/lib/latest-hero-photo-warm'

export const LATEST_TOWN_FEED_LIMIT = 30
export const LATEST_TOWN_FEED_CACHE_PREFIX = 'latest-town-feed:v1'
/** Single stats_cache row for all town feeds (~7 × 30 listings). */
export const LATEST_TOWN_FEEDS_BUNDLE_KEY = `${LATEST_TOWN_FEED_CACHE_PREFIX}:bundle`

export type LatestTownFeedCachePayload = {
  version: 1
  town: string
  listings: LatestListingRow[]
  generatedAt: string
}

export type LatestTownFeedsBundlePayload = {
  version: 1
  towns: Record<string, LatestListingRow[]>
  generatedAt: string
}

function townFeedCacheKey(town: string): string {
  return `${LATEST_TOWN_FEED_CACHE_PREFIX}:${town}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Read every warmed town feed in one pass (bundle first, then per-town keys). */
export async function readAllLatestTownFeedCaches(
  limit = LATEST_TOWN_FEED_LIMIT,
): Promise<Record<string, LatestListingRow[]>> {
  const cap = Math.min(Math.max(limit, 1), 250)
  const bundleRow = await readStatsCacheRow(LATEST_TOWN_FEEDS_BUNDLE_KEY)
  if (bundleRow?.payload) {
    try {
      const parsed = JSON.parse(bundleRow.payload) as LatestTownFeedsBundlePayload
      if (parsed?.version === 1 && parsed.towns && typeof parsed.towns === 'object') {
        const out: Record<string, LatestListingRow[]> = {}
        for (const [town, rows] of Object.entries(parsed.towns)) {
          if (Array.isArray(rows) && rows.length > 0) {
            out[town] = rows.slice(0, cap)
          }
        }
        if (Object.keys(out).length > 0) return out
      }
    } catch {
      /* fall through to per-town keys */
    }
  }

  const out: Record<string, LatestListingRow[]> = {}
  for (const town of TMRE_TOWNS) {
    const rows = await readLatestTownFeedCache(town, cap)
    if (rows?.length) out[town] = rows
  }
  return out
}

async function writeLatestTownFeedsBundleCache(
  towns: Record<string, LatestListingRow[]>,
): Promise<void> {
  const payload: LatestTownFeedsBundlePayload = {
    version: 1,
    towns,
    generatedAt: new Date().toISOString(),
  }
  await writeStatsCacheRow(LATEST_TOWN_FEEDS_BUNDLE_KEY, payload)
}

/** Read a prebuilt Latest town feed from stats_cache (instant path). */
export async function readLatestTownFeedCache(
  town: string,
  limit = LATEST_TOWN_FEED_LIMIT,
): Promise<LatestListingRow[] | null> {
  const key = town.trim()
  if (!key) return null
  const row = await readStatsCacheRow(townFeedCacheKey(key))
  if (!row?.payload) return null

  try {
    const parsed = JSON.parse(row.payload) as LatestTownFeedCachePayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.listings)) return null
    return parsed.listings.slice(0, Math.min(Math.max(limit, 1), 250))
  } catch {
    return null
  }
}

async function rebuildSingleTownFeedCache(
  town: TmreTown,
  limit: number,
): Promise<{ town: string; listings: LatestListingRow[] } | null> {
  const listings = await fetchLatestUpdatedListings({
    town,
    limit,
    bypassTownFeedCache: true,
    bypassGlobalFeedCache: true,
    allowLiveScore: false,
  })
  if (listings.length === 0) {
    const existing = await readLatestTownFeedCache(town, limit)
    if (existing && existing.length > 0) {
      console.warn(
        `[latest-town-feed] ${town}: skipped empty overwrite — keeping last good cache`,
      )
      return { town, listings: existing }
    }
    return null
  }
  const generatedAt = new Date().toISOString()
  const payload: LatestTownFeedCachePayload = {
    version: 1,
    town,
    listings,
    generatedAt,
  }
  await writeStatsCacheRow(townFeedCacheKey(town), payload)
  return { town, listings }
}

/**
 * Rebuild Latest town feeds (top N by modification time) into stats_cache.
 * SQLite listing feeds only on the critical path; bounded hero thumbnails warm afterward.
 * Also refreshes the default (no-town) global Latest ticker cache.
 */
export async function rebuildLatestTownFeedCaches(options: {
  limit?: number
  towns?: readonly TmreTown[]
} = {}): Promise<{
  towns: number
  listings: number
  photos: number
  durationMs: number
}> {
  const limit = options.limit ?? LATEST_TOWN_FEED_LIMIT
  const towns = options.towns ?? TMRE_TOWNS
  const t0 = Date.now()
  let listingCount = 0
  let townsDone = 0

  // Default /latest ticker first so the page has a durable SQLite hit.
  try {
    const { rebuildLatestGlobalFeedCache } = await import('@/lib/latest-feed-cache')
    await rebuildLatestGlobalFeedCache(limit)
  } catch (err) {
    console.warn(
      '[latest-town-feed] global feed rebuild failed',
      err instanceof Error ? err.message : err,
    )
  }

  const bundleTowns: Record<string, LatestListingRow[]> = {}
  const results = await Promise.all(
    towns.map(async (town) => {
      try {
        return await rebuildSingleTownFeedCache(town, limit)
      } catch (err) {
        console.warn(
          `[latest-town-feed] ${town} rebuild failed`,
          err instanceof Error ? err.message : err,
        )
        const existing = await readLatestTownFeedCache(town, limit)
        return existing?.length ? { town, listings: existing } : null
      }
    }),
  )

  for (const result of results) {
    if (!result?.listings.length) continue
    bundleTowns[result.town] = result.listings
    listingCount += result.listings.length
    townsDone += 1
  }

  if (townsDone > 0) {
    await writeLatestTownFeedsBundleCache(bundleTowns)
    const finishedAt = new Date().toISOString()
    setSyncMeta('last_latest_town_feeds', finishedAt)
    publishListingsReadSnapshot()
  }

  const durationMs = Date.now() - t0
  console.info(
    `[latest-town-feed] warmed ${townsDone} towns / ${listingCount} listings in ${durationMs}ms`,
  )

  if (townsDone > 0) {
    warmLatestHeroPhotosDeferred({
      townFeeds: bundleTowns,
      globalListings: (await readLatestGlobalFeedCache(limit)) ?? [],
    })
  }

  return { towns: townsDone, listings: listingCount, photos: 0, durationMs }
}

let townFeedWarmRunning = false

/** Fire-and-forget warm used after each 30-minute incremental DB refresh. */
export function warmLatestTownFeedsDeferred(): void {
  if (townFeedWarmRunning) return
  townFeedWarmRunning = true
  void (async () => {
    try {
      await sleep(1_500)
      await rebuildLatestTownFeedCaches()
    } catch (err) {
      console.error('[latest-town-feed] deferred warm failed', err)
    } finally {
      townFeedWarmRunning = false
    }
  })()
}
