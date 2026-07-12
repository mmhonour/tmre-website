import {
  getListingsDbStats,
  getSyncMeta,
  publishListingsReadSnapshot,
  readAllListingsFromDb,
  readListingsFromDb,
  setSyncMeta,
} from '@/lib/listings-db'
import {
  clearStatsCache,
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { beginSqliteRefresh, endSqliteRefresh } from '@/lib/sqlite-refresh-status'
import { hasLocalListingsCache } from '@/lib/listings-store'
import { filterListingsByKind, LISTING_KINDS, type ListingKind } from '@/lib/listing-kind'
import {
  computeActiveByMonth,
  computeMarketStats,
  computeSalesByMonth,
  computeSalesByPrice,
  computeSalesByVintage,
  statsCacheKey,
  type ActiveByMonthByTownPayload,
  type SalesByMonthByTownPayload,
  type StatsCacheScope,
} from '@/lib/stats-compute'
import { listingToStatsRow, type StatsListingRow } from '@/lib/stats-listing-rows'
import { STATS_MONTH_CHART_START_YEAR, statsMonthChartYears } from '@/lib/stats-month-years'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'
import { rebuildIntelligenceTownSnapshots } from '@/lib/intelligence-town-snapshot'
import {
  SqliteWriteStatsCollector,
  type TableWriteStats,
} from '@/lib/sqlite-sync-stats'

/** Stats payloads are refreshed on this interval (1 hour). */
export const STATS_CACHE_TTL_MS = 60 * 60 * 1000

let emptyCacheRebuildAttempted = false
let backgroundRebuildScheduled = false

type MonthlyCount = { year: number; month: number; count: number }

function aggregateMonthCounts(
  rows: MonthlyCount[][],
  years: readonly number[],
): MonthlyCount[] {
  const totals = new Map<string, number>()
  for (const data of rows) {
    for (const { year, month, count } of data) {
      const key = `${year}-${month}`
      totals.set(key, (totals.get(key) ?? 0) + count)
    }
  }
  const combined: MonthlyCount[] = []
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      combined.push({ year, month, count: totals.get(`${year}-${month}`) ?? 0 })
    }
  }
  return combined
}

export async function readAggregatedSalesByMonth(
  kind: ListingKind,
): Promise<(ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }) | null> {
  const rows: MonthlyCount[][] = []
  let generatedAt: string | undefined
  for (const town of TMRE_TOWNS) {
    const cached = await readStatsCache<ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }>(
      'sales-by-month',
      town,
      kind,
    )
    if (!cached?.data?.length) continue
    rows.push(cached.data)
    generatedAt = cached.generatedAt ?? generatedAt
  }
  if (!rows.length) return null
  return {
    city: 'All',
    kind,
    data: aggregateMonthCounts(rows, statsMonthChartYears()),
    closedThisWeek: 0,
    closedThisWeekByZip: {},
    generatedAt,
  }
}

export async function readAggregatedActiveByMonth(
  kind: ListingKind,
): Promise<(ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }) | null> {
  const rows: MonthlyCount[][] = []
  let generatedAt: string | undefined
  for (const town of TMRE_TOWNS) {
    const cached = await readStatsCache<ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }>(
      'active-by-month',
      town,
      kind,
    )
    if (!cached?.data?.length) continue
    rows.push(cached.data)
    generatedAt = cached.generatedAt ?? generatedAt
  }
  if (!rows.length) return null
  return {
    city: 'All',
    kind,
    data: aggregateMonthCounts(rows, statsMonthChartYears()),
    generatedAt,
  }
}

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

/** Month comparison charts — both persisted per town × kind in stats_cache. */
const MONTH_CHART_CACHE_SCOPES = ['sales-by-month', 'active-by-month'] as const satisfies readonly StatsCacheScope[]

function monthChartPayloadCurrent(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as { data?: { year: number }[] }
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) return false
    const years = new Set(parsed.data.map((d) => d.year))
    return years.has(STATS_MONTH_CHART_START_YEAR)
  } catch {
    return false
  }
}

async function statsCacheMissingMedians(): Promise<boolean> {
  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      const row = await readStatsCacheRow(statsCacheKey('market-stats', town, kind))
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

async function statsCacheMissingMonthCharts(): Promise<boolean> {
  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      for (const scope of MONTH_CHART_CACHE_SCOPES) {
        const row = await readStatsCacheRow(statsCacheKey(scope, town, kind))
        if (!row) return true
        if (!monthChartPayloadCurrent(row.payload)) return true
      }
    }
  }
  return false
}

async function statsCacheMissingRequiredEntries(): Promise<boolean> {
  return (await statsCacheMissingMedians()) || (await statsCacheMissingMonthCharts())
}

async function ensureStatsCachePopulated(): Promise<void> {
  if (emptyCacheRebuildAttempted || !hasLocalListingsCache()) return
  const { total, statsCacheEntries } = getListingsDbStats()
  if (total > 0 && (statsCacheEntries === 0 || (await statsCacheMissingRequiredEntries()))) {
    emptyCacheRebuildAttempted = true
    scheduleStatsCacheRebuildIfStale(true)
  }
}

export async function readStatsCache<T>(
  scope: StatsCacheScope,
  city: string,
  kind: ListingKind,
): Promise<T | null> {
  if (!hasLocalListingsCache()) return null
  await ensureStatsCachePopulated()
  const row = await readStatsCacheRow(statsCacheKey(scope, city, kind))
  if (!row) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

export async function writeStatsCache(
  scope: StatsCacheScope,
  city: string,
  kind: ListingKind,
  payload: unknown,
): Promise<void> {
  await writeStatsCacheRow(statsCacheKey(scope, city, kind), payload)
}

export async function readSalesByMonthByTown(
  kind: ListingKind,
): Promise<(SalesByMonthByTownPayload & { generatedAt?: string }) | null> {
  return readStatsCache('sales-by-month-by-town', 'All', kind)
}

export async function readActiveByMonthByTown(
  kind: ListingKind,
): Promise<(ActiveByMonthByTownPayload & { generatedAt?: string }) | null> {
  return readStatsCache('active-by-month-by-town', 'All', kind)
}

export async function readSalesByMonth(
  city: string,
  kind: ListingKind,
): Promise<(ReturnType<typeof computeSalesByMonth> & { generatedAt?: string }) | null> {
  return readStatsCache('sales-by-month', city, kind)
}

export async function readActiveByMonth(
  city: string,
  kind: ListingKind,
): Promise<(ReturnType<typeof computeActiveByMonth> & { generatedAt?: string }) | null> {
  return readStatsCache('active-by-month', city, kind)
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
export async function rebuildStatsCache(options: { trackRefresh?: boolean } = {}): Promise<{
  written: number
  durationMs: number
}> {
  const trackRefresh = options.trackRefresh !== false
  if (trackRefresh) beginSqliteRefresh('stats-cache')
  const startedAt = new Date().toISOString()
  setSyncMeta('last_stats_cache_started', startedAt)
  const t0 = Date.now()
  try {
  await clearStatsCache()

  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: Date.now() - t0 }
  }

  publishListingsReadSnapshot()

  let written = 0
  const generatedAt = new Date().toISOString()
  const salesByMonthByTown: Record<
    (typeof LISTING_KINDS)[number],
    Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>
  > = {
    sale: {} as Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>,
    rental: {} as Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>,
  }
  const activeByMonthByTown: Record<
    (typeof LISTING_KINDS)[number],
    Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>
  > = {
    sale: {} as Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>,
    rental: {} as Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>,
  }

  for (const town of TMRE_TOWNS) {
    const active = readListingsFromDb(town, 'Active', 500)
    const closed = readListingsFromDb(town, 'Closed', 2500)

    for (const kind of LISTING_KINDS) {
      await writeStatsCache(
        'market-stats',
        town,
        kind,
        { ...computeMarketStats(active, town, kind, closed), generatedAt },
      )
      written += 1

      await writeStatsCache(
        'market-stats-listings',
        town,
        kind,
        { listings: buildMedianListingRows(closed, town, kind), generatedAt },
      )
      written += 1

      const monthPayload = computeSalesByMonth(closed, town, kind)
      await writeStatsCache('sales-by-month', town, kind, { ...monthPayload, generatedAt })
      salesByMonthByTown[kind][town] = monthPayload.data
      written += 1

      const activeMonthPayload = computeActiveByMonth(active, closed, town, kind)
      await writeStatsCache('active-by-month', town, kind, { ...activeMonthPayload, generatedAt })
      activeByMonthByTown[kind][town] = activeMonthPayload.data
      written += 1

      await writeStatsCache(
        'sales-by-vintage',
        town,
        kind,
        { ...computeSalesByVintage(closed, town, kind), generatedAt },
      )
      written += 1

      await writeStatsCache(
        'sales-by-price',
        town,
        kind,
        { ...computeSalesByPrice(closed, town, kind), generatedAt },
      )
      written += 1
    }
  }

  for (const kind of LISTING_KINDS) {
    await writeStatsCache('sales-by-month-by-town', 'All', kind, {
      kind,
      towns: salesByMonthByTown[kind],
      generatedAt,
    })
    await writeStatsCache('active-by-month-by-town', 'All', kind, {
      kind,
      towns: activeByMonthByTown[kind],
      generatedAt,
    })
    written += 2
  }

  const allClosed = readAllListingsFromDb(TMRE_TOWNS, 'Closed')
  for (const kind of LISTING_KINDS) {
    await writeStatsCache(
      'sales-by-vintage',
      'All',
      kind,
      { ...computeSalesByVintage(allClosed, 'All', kind), generatedAt },
    )
    await writeStatsCache(
      'sales-by-price',
      'All',
      kind,
      { ...computeSalesByPrice(allClosed, 'All', kind), generatedAt },
    )
    written += 2
  }

  setSyncMeta('last_stats_cache', generatedAt)
  console.info(`[stats-cache] rebuilt ${written} entries in ${Date.now() - t0}ms`)

  try {
    const snap = await rebuildIntelligenceTownSnapshots()
    written += snap.written
  } catch (err) {
    console.error('[stats-cache] town snapshot rebuild failed', err)
  }

  return { written, durationMs: Date.now() - t0 }
  } finally {
    if (trackRefresh) endSqliteRefresh(new Date().toISOString())
  }
}

/** Rebuild stats cache when missing or older than STATS_CACHE_TTL_MS. */
export async function rebuildStatsCacheIfStale(force = false): Promise<{
  written: number
  durationMs: number
  skipped?: boolean
}> {
  if (!hasLocalListingsCache()) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (!force && !isStatsCacheStale() && !(await statsCacheMissingRequiredEntries())) {
    const { statsCacheEntries } = getListingsDbStats()
    if (statsCacheEntries > 0) {
      return { written: 0, durationMs: 0, skipped: true }
    }
  }
  return rebuildStatsCache()
}

/** Queue a stats cache rebuild without blocking the current request. */
export function scheduleStatsCacheRebuildIfStale(force = false): void {
  if (!hasLocalListingsCache()) return
  if (backgroundRebuildScheduled) return
  backgroundRebuildScheduled = true
  void (async () => {
    try {
      if (!force && !isStatsCacheStale() && !(await statsCacheMissingRequiredEntries())) {
        const { statsCacheEntries } = getListingsDbStats()
        if (statsCacheEntries > 0) return
      }
      await rebuildStatsCacheIfStale(force)
    } catch (err) {
      console.error('[stats-cache] background rebuild failed', err)
    } finally {
      backgroundRebuildScheduled = false
    }
  })()
}
