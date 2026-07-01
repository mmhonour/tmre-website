import {
  clearStatsCache,
  getListingsDbStats,
  getSyncMeta,
  readAllListingsFromDb,
  readListingsFromDb,
  readStatsCacheRow,
  setSyncMeta,
  writeStatsCacheRow,
} from '@/lib/listings-db'
import { hasLocalListingsCache } from '@/lib/listings-store'
import { filterListingsByKind, LISTING_KINDS, type ListingKind } from '@/lib/listing-kind'
import {
  computeMarketStats,
  computeSalesByMonth,
  computeSalesByPrice,
  computeSalesByVintage,
  statsCacheKey,
  type StatsCacheScope,
} from '@/lib/stats-compute'
import { listingToStatsRow, type StatsListingRow } from '@/lib/stats-listing-rows'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

/** Stats payloads are refreshed on this interval (30 minutes). */
export const STATS_CACHE_TTL_MS = 30 * 60 * 1000

let emptyCacheRebuildAttempted = false

export function getStatsCacheAgeMs(): number | null {
  const ts = getSyncMeta('last_stats_cache')
  if (!ts) return null
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return null
  return Date.now() - ms
}

export function isStatsCacheStale(): boolean {
  const age = getStatsCacheAgeMs()
  if (age == null) return true
  return age >= STATS_CACHE_TTL_MS
}

function statsCacheMissingMedians(): boolean {
  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      const row = readStatsCacheRow(statsCacheKey('market-stats', town, kind))
      if (!row) return true
      try {
        const payload = JSON.parse(row.payload) as { medianPrice?: number | null }
        if (payload.medianPrice == null) return true
      } catch {
        return true
      }
    }
  }
  return false
}

function ensureStatsCachePopulated(): void {
  if (emptyCacheRebuildAttempted || !hasLocalListingsCache()) return
  emptyCacheRebuildAttempted = true
  const { total, statsCacheEntries } = getListingsDbStats()
  if (total > 0 && (statsCacheEntries === 0 || statsCacheMissingMedians())) {
    try {
      rebuildStatsCache()
    } catch (err) {
      console.error('[stats-cache] lazy rebuild failed', err)
    }
  }
}

export function readStatsCache<T>(scope: StatsCacheScope, city: string, kind: ListingKind): T | null {
  if (!hasLocalListingsCache()) return null
  ensureStatsCachePopulated()
  const row = readStatsCacheRow(statsCacheKey(scope, city, kind))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

export function writeStatsCache(
  scope: StatsCacheScope,
  city: string,
  kind: ListingKind,
  payload: unknown,
): void {
  writeStatsCacheRow(statsCacheKey(scope, city, kind), payload)
}

export type TownStatsBundle = {
  marketStats: ReturnType<typeof computeMarketStats> & { generatedAt: string }
  vintage: ReturnType<typeof computeSalesByVintage> & { generatedAt: string }
  medianListings: StatsListingRow[]
}

function buildMedianListingRows(
  closed: Listing[],
  town: string,
  kind: ListingKind,
): StatsListingRow[] {
  return filterListingsByKind(closed, kind)
    .map((l) => listingToStatsRow(l, town, kind))
    .filter((row): row is StatsListingRow => row != null)
    .sort((a, b) => {
      const aMs = a.listDate ? Date.parse(a.listDate) : 0
      const bMs = b.listDate ? Date.parse(b.listDate) : 0
      return bMs - aMs
    })
}

/** Build stats page payloads from in-memory listing arrays (RETS fallback). */
export function computeTownBundleFromListings(
  town: string,
  kind: ListingKind,
  active: Listing[],
  closed: Listing[],
): TownStatsBundle {
  const generatedAt = new Date().toISOString()
  return {
    marketStats: { ...computeMarketStats(active, town, kind, closed), generatedAt },
    vintage: { ...computeSalesByVintage(closed, town, kind), generatedAt },
    medianListings: buildMedianListingRows(closed, town, kind),
  }
}

/** Recompute all Stats API payloads from SQLite listings and persist to stats_cache. */
export function rebuildStatsCache(): { written: number; durationMs: number } {
  const t0 = Date.now()
  clearStatsCache()

  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: Date.now() - t0 }
  }

  let written = 0
  const generatedAt = new Date().toISOString()

  for (const town of TMRE_TOWNS) {
    const active = readListingsFromDb(town, 'Active', 500)
    const closed = readListingsFromDb(town, 'Closed', 2500)

    for (const kind of LISTING_KINDS) {
      writeStatsCache(
        'market-stats',
        town,
        kind,
        { ...computeMarketStats(active, town, kind, closed), generatedAt },
      )
      written += 1

      writeStatsCache(
        'market-stats-listings',
        town,
        kind,
        { listings: buildMedianListingRows(closed, town, kind), generatedAt },
      )
      written += 1

      writeStatsCache(
        'sales-by-month',
        town,
        kind,
        { ...computeSalesByMonth(closed, town, kind), generatedAt },
      )
      written += 1

      writeStatsCache(
        'sales-by-vintage',
        town,
        kind,
        { ...computeSalesByVintage(closed, town, kind), generatedAt },
      )
      written += 1

      writeStatsCache(
        'sales-by-price',
        town,
        kind,
        { ...computeSalesByPrice(closed, town, kind), generatedAt },
      )
      written += 1
    }
  }

  const allClosed = readAllListingsFromDb(TMRE_TOWNS, 'Closed')
  for (const kind of LISTING_KINDS) {
    writeStatsCache(
      'sales-by-vintage',
      'All',
      kind,
      { ...computeSalesByVintage(allClosed, 'All', kind), generatedAt },
    )
    writeStatsCache(
      'sales-by-price',
      'All',
      kind,
      { ...computeSalesByPrice(allClosed, 'All', kind), generatedAt },
    )
    written += 2
  }

  setSyncMeta('last_stats_cache', generatedAt)
  console.info(`[stats-cache] rebuilt ${written} entries in ${Date.now() - t0}ms`)

  return { written, durationMs: Date.now() - t0 }
}

/** Rebuild stats cache when missing or older than STATS_CACHE_TTL_MS. */
export function rebuildStatsCacheIfStale(force = false): {
  written: number
  durationMs: number
  skipped?: boolean
} {
  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (!force && !isStatsCacheStale()) {
    const { statsCacheEntries } = getListingsDbStats()
    if (statsCacheEntries > 0) {
      return { written: 0, durationMs: 0, skipped: true }
    }
  }
  return rebuildStatsCache()
}
