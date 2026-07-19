import 'server-only'

import {
  fetchLatestUpdatedListings,
  type LatestListingRow,
} from '@/lib/latest-listings'
import { setSyncMeta } from '@/lib/db/sync-meta-store'
import { readStatsCacheRow, writeStatsCacheRow } from '@/lib/db/stats-cache-repo'

/** Default (no-town) Latest ticker — served instantly outside full sync rebuilds. */
export const LATEST_GLOBAL_FEED_CACHE_KEY = 'latest-feed:v1:global'
export const LATEST_GLOBAL_FEED_LIMIT = 30

export type LatestGlobalFeedCachePayload = {
  version: 1
  listings: LatestListingRow[]
  generatedAt: string
}

/** Instant path for the default /latest view. */
export async function readLatestGlobalFeedCache(
  limit = LATEST_GLOBAL_FEED_LIMIT,
): Promise<LatestListingRow[] | null> {
  const row = await readStatsCacheRow(LATEST_GLOBAL_FEED_CACHE_KEY)
  if (!row?.payload) return null

  try {
    const parsed = JSON.parse(row.payload) as LatestGlobalFeedCachePayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.listings)) return null
    if (parsed.listings.length === 0) return null
    return parsed.listings.slice(0, Math.min(Math.max(limit, 1), 250))
  } catch {
    return null
  }
}

/** Persist only non-empty feeds so a bad warm cannot wipe the last good ticker. */
export async function writeLatestGlobalFeedCache(
  listings: LatestListingRow[],
): Promise<boolean> {
  if (listings.length === 0) {
    const existing = await readLatestGlobalFeedCache(LATEST_GLOBAL_FEED_LIMIT)
    if (existing && existing.length > 0) {
      console.warn(
        '[latest-feed] skipped empty global overwrite — keeping last good cache',
      )
      return false
    }
  }

  const payload: LatestGlobalFeedCachePayload = {
    version: 1,
    listings,
    generatedAt: new Date().toISOString(),
  }
  await writeStatsCacheRow(LATEST_GLOBAL_FEED_CACHE_KEY, payload)
  setSyncMeta('last_latest_global_feed', payload.generatedAt)
  return true
}

/** Rebuild the default Latest ticker from SQLite (stored scores only). */
export async function rebuildLatestGlobalFeedCache(
  limit = LATEST_GLOBAL_FEED_LIMIT,
): Promise<{ listings: number; durationMs: number }> {
  const t0 = Date.now()
  const listings = await fetchLatestUpdatedListings({
    limit,
    // Live-score + persist so the ticker does not show 0.0 for new updates
    // that the listing detail page would score on demand.
    allowLiveScore: true,
    bypassGlobalFeedCache: true,
    bypassTownFeedCache: true,
  })
  await writeLatestGlobalFeedCache(listings)
  const durationMs = Date.now() - t0
  console.info(
    `[latest-feed] warmed global feed (${listings.length} listings) in ${durationMs}ms`,
  )
  return { listings: listings.length, durationMs }
}
