import {
  listingRowId,
  readAllListingsFromDb,
  readListingScoresByIds,
  readListingsDbStats,
  readListingsFromDb,
} from '@/lib/db/listings-repo'
import {
  getSyncMeta,
  releaseTimedLock,
  setSyncMeta,
  tryAcquireTimedLock,
} from '@/lib/db/sync-meta-store'
import {
  readStatsCacheRow,
  writeStatsCacheRow,
} from '@/lib/db/stats-cache-repo'
import { beginSqliteRefresh, endSqliteRefresh } from '@/lib/sqlite-refresh-status'
import { hasLocalListingsCache } from '@/lib/listings-store'
import { filterListingsByKind, LISTING_KINDS, type ListingKind } from '@/lib/listing-kind'
import {
  computeActiveByMonth,
  computeAvgScoreByVintage,
  computeMarketStats,
  computeSalesByMonth,
  computeSalesByPrice,
  computeSalesByVintage,
  statsCacheKey,
  type ActiveByMonthByTownPayload,
  type AvgScoreByVintageByTownPayload,
  type AvgScoreByVintagePayload,
  type SalesByMonthByTownPayload,
  type StatsCacheScope,
} from '@/lib/stats-compute'
import { listingToStatsRow, type StatsListingRow } from '@/lib/stats-listing-rows'
import { STATS_MONTH_CHART_START_YEAR, statsMonthChartYears } from '@/lib/stats-month-years'
import type { Listing } from '@/lib/rets'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'
import { rebuildIntelligenceTownSnapshots } from '@/lib/intelligence-town-snapshot'
import { refreshInterestingStat } from '@/lib/interesting-stat'
import {
  MONTHS_SUPPLY_INDEX_KEY,
  rebuildMonthsSupplyCache,
} from '@/lib/months-supply-cache'
import {
  SqliteWriteStatsCollector,
  type TableWriteStats,
} from '@/lib/sqlite-sync-stats'

/** Stats payloads are refreshed on this interval (1 hour). */
export const STATS_CACHE_TTL_MS = 60 * 60 * 1000

/** sync_meta key — ISO start time while a stats_cache rebuild holds the lock. */
export const STATS_CACHE_REBUILD_LOCK_KEY = 'stats_cache_rebuild_lock'

/** Steal the rebuild lock if the holder has been silent this long (dead Lambda). */
const STATS_CACHE_REBUILD_LOCK_STALE_MS = 20 * 60 * 1000

let emptyCacheRebuildAttempted = false
let backgroundRebuildScheduled = false

type KindTownMonthData = Record<
  (typeof LISTING_KINDS)[number],
  Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>
>
type KindTownActiveMonthData = Record<
  (typeof LISTING_KINDS)[number],
  Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>
>
type KindTownAvgScoreData = Record<
  (typeof LISTING_KINDS)[number],
  Record<TmreTown, AvgScoreByVintagePayload>
>

function emptyKindTownMonthData(): KindTownMonthData {
  return {
    sale: {} as Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>,
    rental: {} as Record<TmreTown, ReturnType<typeof computeSalesByMonth>['data']>,
  }
}

function emptyKindTownActiveMonthData(): KindTownActiveMonthData {
  return {
    sale: {} as Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>,
    rental: {} as Record<TmreTown, ReturnType<typeof computeActiveByMonth>['data']>,
  }
}

function emptyKindTownAvgScoreData(): KindTownAvgScoreData {
  return {
    sale: {} as Record<TmreTown, AvgScoreByVintagePayload>,
    rental: {} as Record<TmreTown, AvgScoreByVintagePayload>,
  }
}

async function acquireStatsCacheRebuildLock(): Promise<string | null> {
  const token = new Date().toISOString()
  const ok = await tryAcquireTimedLock(
    STATS_CACHE_REBUILD_LOCK_KEY,
    token,
    STATS_CACHE_REBUILD_LOCK_STALE_MS,
  )
  if (!ok) {
    console.info('[stats-cache] skipped — rebuild lock held')
    return null
  }
  return token
}

async function releaseStatsCacheRebuildLock(token: string | null): Promise<void> {
  if (!token) return
  try {
    await releaseTimedLock(STATS_CACHE_REBUILD_LOCK_KEY, token)
  } catch (err) {
    console.error('[stats-cache] failed to release rebuild lock', err)
  }
}

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

async function statsCacheMissingMonthsSupply(): Promise<boolean> {
  const row = await readStatsCacheRow(MONTHS_SUPPLY_INDEX_KEY)
  return row == null
}

async function statsCacheMissingRequiredEntries(): Promise<boolean> {
  return (
    (await statsCacheMissingMedians()) ||
    (await statsCacheMissingMonthCharts()) ||
    (await statsCacheMissingMonthsSupply())
  )
}

async function ensureStatsCachePopulated(): Promise<void> {
  if (emptyCacheRebuildAttempted || !(await hasLocalListingsCache())) return
  const { total, statsCacheEntries } = await readListingsDbStats()
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
  if (!(await hasLocalListingsCache())) return null
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

export async function readAvgScoreByVintage(
  city: string,
  kind: ListingKind,
): Promise<(AvgScoreByVintagePayload & { generatedAt?: string }) | null> {
  return readStatsCache('avg-score-by-vintage', city, kind)
}

/**
 * Recompute Active Goldilocks averages by vintage (per town + All + by-town
 * bundle). Safe to call after listing scores change without clearing the rest
 * of stats_cache.
 */
export async function rebuildAvgScoreByVintageCache(): Promise<{
  written: number
  durationMs: number
}> {
  const t0 = Date.now()
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0 }
  }

  let written = 0
  const generatedAt = new Date().toISOString()
  const byTown: Record<
    (typeof LISTING_KINDS)[number],
    Record<TmreTown, AvgScoreByVintagePayload>
  > = {
    sale: {} as Record<TmreTown, AvgScoreByVintagePayload>,
    rental: {} as Record<TmreTown, AvgScoreByVintagePayload>,
  }

  for (const town of TMRE_TOWNS) {
    const active = await readListingsFromDb(town, 'Active', 500)
    const scoredActive = await scoredActiveRows(active)
    for (const kind of LISTING_KINDS) {
      const payload = computeAvgScoreByVintage(scoredActive, town, kind)
      await writeStatsCache('avg-score-by-vintage', town, kind, {
        ...payload,
        generatedAt,
      })
      byTown[kind][town] = payload
      written += 1
    }
  }

  const allActive = await readAllListingsFromDb(TMRE_TOWNS, 'Active')
  const allScored = await scoredActiveRows(allActive)
  for (const kind of LISTING_KINDS) {
    await writeStatsCache('avg-score-by-vintage-by-town', 'All', kind, {
      kind,
      towns: byTown[kind],
      generatedAt,
    })
    await writeStatsCache('avg-score-by-vintage', 'All', kind, {
      ...computeAvgScoreByVintage(allScored, 'All', kind),
      generatedAt,
    })
    written += 2
  }

  console.info(
    `[stats-cache] avg-score-by-vintage rebuilt ${written} entries in ${Date.now() - t0}ms`,
  )
  return { written, durationMs: Date.now() - t0 }
}

async function scoredActiveRows(active: Listing[]): Promise<
  {
    yearBuilt: number | null
    goldilocksScore: number
    propertyType: string
    raw?: Record<string, string>
  }[]
> {
  const ids = active.map((l) => listingRowId(l)).filter(Boolean)
  const scoreMap = await readListingScoresByIds(ids)
  const out: {
    yearBuilt: number | null
    goldilocksScore: number
    propertyType: string
    raw?: Record<string, string>
  }[] = []
  for (const listing of active) {
    const id = listingRowId(listing)
    const score = id ? scoreMap.get(id)?.score : null
    if (score == null || !Number.isFinite(score)) continue
    out.push({
      yearBuilt: listing.yearBuilt,
      goldilocksScore: score,
      propertyType: listing.propertyType,
      raw: listing.raw,
    })
  }
  return out
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

type TownListingsMap = Record<TmreTown, { active: Listing[]; closed: Listing[] }>

/** Upsert market scopes for one town; optionally fill by-town bundle maps. */
async function writeTownMarketStats(
  town: TmreTown,
  active: Listing[],
  closed: Listing[],
  generatedAt: string,
  bundles?: {
    salesByMonthByTown: KindTownMonthData
    activeByMonthByTown: KindTownActiveMonthData
    avgScoreByVintageByTown: KindTownAvgScoreData
  },
): Promise<number> {
  let written = 0
  const scoredActive = await scoredActiveRows(active)

  for (const kind of LISTING_KINDS) {
    await writeStatsCache('market-stats', town, kind, {
      ...computeMarketStats(active, town, kind, closed),
      generatedAt,
    })
    written += 1

    await writeStatsCache('market-stats-listings', town, kind, {
      listings: buildMedianListingRows(closed, town, kind),
      generatedAt,
    })
    written += 1

    const monthPayload = computeSalesByMonth(closed, town, kind)
    await writeStatsCache('sales-by-month', town, kind, { ...monthPayload, generatedAt })
    if (bundles) bundles.salesByMonthByTown[kind][town] = monthPayload.data
    written += 1

    const activeMonthPayload = computeActiveByMonth(active, closed, town, kind)
    await writeStatsCache('active-by-month', town, kind, {
      ...activeMonthPayload,
      generatedAt,
    })
    if (bundles) bundles.activeByMonthByTown[kind][town] = activeMonthPayload.data
    written += 1

    await writeStatsCache('sales-by-vintage', town, kind, {
      ...computeSalesByVintage(closed, town, kind),
      generatedAt,
    })
    written += 1

    await writeStatsCache('sales-by-price', town, kind, {
      ...computeSalesByPrice(closed, town, kind),
      generatedAt,
    })
    written += 1

    const avgScorePayload = computeAvgScoreByVintage(scoredActive, town, kind)
    await writeStatsCache('avg-score-by-vintage', town, kind, {
      ...avgScorePayload,
      generatedAt,
    })
    if (bundles) bundles.avgScoreByVintageByTown[kind][town] = avgScorePayload
    written += 1
  }

  return written
}

async function writeByTownBundles(
  salesByMonthByTown: KindTownMonthData,
  activeByMonthByTown: KindTownActiveMonthData,
  avgScoreByVintageByTown: KindTownAvgScoreData,
  generatedAt: string,
): Promise<number> {
  let written = 0
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
    const avgBundle: AvgScoreByVintageByTownPayload = {
      kind,
      towns: avgScoreByVintageByTown[kind],
    }
    await writeStatsCache('avg-score-by-vintage-by-town', 'All', kind, {
      ...avgBundle,
      generatedAt,
    })
    written += 3
  }
  return written
}

async function readCachedJsonPayload<T>(cacheKey: string): Promise<T | null> {
  const row = await readStatsCacheRow(cacheKey)
  if (!row) return null
  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

/** Rebuild `*-by-town:All` bundles from per-town cache rows (after a partial town upsert). */
async function refreshByTownBundlesFromTownCaches(generatedAt: string): Promise<number> {
  const salesByMonthByTown = emptyKindTownMonthData()
  const activeByMonthByTown = emptyKindTownActiveMonthData()
  const avgScoreByVintageByTown = emptyKindTownAvgScoreData()

  for (const town of TMRE_TOWNS) {
    for (const kind of LISTING_KINDS) {
      const sales = await readCachedJsonPayload<ReturnType<typeof computeSalesByMonth>>(
        statsCacheKey('sales-by-month', town, kind),
      )
      if (sales?.data) salesByMonthByTown[kind][town] = sales.data

      const active = await readCachedJsonPayload<ReturnType<typeof computeActiveByMonth>>(
        statsCacheKey('active-by-month', town, kind),
      )
      if (active?.data) activeByMonthByTown[kind][town] = active.data

      const avg = await readCachedJsonPayload<AvgScoreByVintagePayload>(
        statsCacheKey('avg-score-by-vintage', town, kind),
      )
      if (avg) avgScoreByVintageByTown[kind][town] = avg
    }
  }

  return writeByTownBundles(
    salesByMonthByTown,
    activeByMonthByTown,
    avgScoreByVintageByTown,
    generatedAt,
  )
}

async function writeAllAggregateStats(generatedAt: string): Promise<number> {
  let written = 0
  const [allClosed, allActive] = await Promise.all([
    readAllListingsFromDb(TMRE_TOWNS, 'Closed'),
    readAllListingsFromDb(TMRE_TOWNS, 'Active'),
  ])
  const allScoredActive = await scoredActiveRows(allActive)
  for (const kind of LISTING_KINDS) {
    await writeStatsCache('sales-by-vintage', 'All', kind, {
      ...computeSalesByVintage(allClosed, 'All', kind),
      generatedAt,
    })
    await writeStatsCache('sales-by-price', 'All', kind, {
      ...computeSalesByPrice(allClosed, 'All', kind),
      generatedAt,
    })
    await writeStatsCache('avg-score-by-vintage', 'All', kind, {
      ...computeAvgScoreByVintage(allScoredActive, 'All', kind),
      generatedAt,
    })
    written += 3
  }
  return written
}

type RebuildStatsResult = {
  written: number
  durationMs: number
  skipped?: boolean
}

/**
 * Recompute Stats API payloads from listings and upsert into stats_cache.
 * Does not clear existing rows — failed mid-rebuild leaves prior payloads intact.
 */
export async function rebuildStatsCache(options: { trackRefresh?: boolean } = {}): Promise<RebuildStatsResult> {
  const trackRefresh = options.trackRefresh !== false
  const lockToken = await acquireStatsCacheRebuildLock()
  if (!lockToken) {
    return { written: 0, durationMs: 0, skipped: true }
  }

  if (trackRefresh) beginSqliteRefresh('stats-cache')
  const startedAt = new Date().toISOString()
  setSyncMeta('last_stats_cache_started', startedAt)
  const t0 = Date.now()
  try {
    if (!(await hasLocalListingsCache())) {
      return { written: 0, durationMs: Date.now() - t0 }
    }

    let written = 0
    const generatedAt = new Date().toISOString()
    const salesByMonthByTown = emptyKindTownMonthData()
    const activeByMonthByTown = emptyKindTownActiveMonthData()
    const avgScoreByVintageByTown = emptyKindTownAvgScoreData()
    const townListingsForMonthsSupply = {} as TownListingsMap

    for (const town of TMRE_TOWNS) {
      const [active, closed] = await Promise.all([
        readListingsFromDb(town, 'Active', 500),
        readListingsFromDb(town, 'Closed', 2500),
      ])
      townListingsForMonthsSupply[town] = { active, closed }
      written += await writeTownMarketStats(town, active, closed, generatedAt, {
        salesByMonthByTown,
        activeByMonthByTown,
        avgScoreByVintageByTown,
      })
    }

    written += await writeByTownBundles(
      salesByMonthByTown,
      activeByMonthByTown,
      avgScoreByVintageByTown,
      generatedAt,
    )
    written += await writeAllAggregateStats(generatedAt)

    try {
      const ms = await rebuildMonthsSupplyCache({
        townListings: townListingsForMonthsSupply,
      })
      written += ms.written
    } catch (err) {
      console.error('[stats-cache] months-supply rebuild failed', err)
    }

    setSyncMeta('last_stats_cache', generatedAt)
    console.info(`[stats-cache] rebuilt ${written} entries in ${Date.now() - t0}ms`)

    try {
      const snap = await rebuildIntelligenceTownSnapshots()
      written += snap.written
    } catch (err) {
      console.error('[stats-cache] town snapshot rebuild failed', err)
    }

    try {
      if (await refreshInterestingStat(generatedAt)) written += 1
    } catch (err) {
      console.error('[stats-cache] interesting-stat refresh failed', err)
    }

    return { written, durationMs: Date.now() - t0 }
  } finally {
    if (trackRefresh) endSqliteRefresh(new Date().toISOString())
    await releaseStatsCacheRebuildLock(lockToken)
  }
}

/**
 * Upsert stats for specific towns, then refresh by-town bundles + All aggregates.
 * Used after incremental MLS sync when only some towns changed.
 */
export async function rebuildStatsCacheForTowns(
  towns: readonly TmreTown[],
  options: { trackRefresh?: boolean } = {},
): Promise<RebuildStatsResult> {
  const unique = [...new Set(towns)]
  if (unique.length === 0) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (unique.length >= TMRE_TOWNS.length) {
    return rebuildStatsCache(options)
  }

  const trackRefresh = options.trackRefresh === true
  const lockToken = await acquireStatsCacheRebuildLock()
  if (!lockToken) {
    return { written: 0, durationMs: 0, skipped: true }
  }

  if (trackRefresh) beginSqliteRefresh('stats-cache')
  const startedAt = new Date().toISOString()
  setSyncMeta('last_stats_cache_started', startedAt)
  const t0 = Date.now()
  try {
    if (!(await hasLocalListingsCache())) {
      return { written: 0, durationMs: Date.now() - t0 }
    }

    let written = 0
    const generatedAt = new Date().toISOString()
    const townListingsForMonthsSupply = {} as TownListingsMap

    for (const town of unique) {
      const [active, closed] = await Promise.all([
        readListingsFromDb(town, 'Active', 500),
        readListingsFromDb(town, 'Closed', 2500),
      ])
      townListingsForMonthsSupply[town] = { active, closed }
      written += await writeTownMarketStats(town, active, closed, generatedAt)
    }

    written += await refreshByTownBundlesFromTownCaches(generatedAt)
    written += await writeAllAggregateStats(generatedAt)

    try {
      const ms = await rebuildMonthsSupplyCache({
        townListings: townListingsForMonthsSupply,
      })
      written += ms.written
    } catch (err) {
      console.error('[stats-cache] months-supply rebuild failed (per-town)', err)
    }

    setSyncMeta('last_stats_cache', generatedAt)
    console.info(
      `[stats-cache] per-town rebuild (${unique.join(', ')}) wrote ${written} entries in ${Date.now() - t0}ms`,
    )

    try {
      const snap = await rebuildIntelligenceTownSnapshots()
      written += snap.written
    } catch (err) {
      console.error('[stats-cache] town snapshot rebuild failed (per-town)', err)
    }

    try {
      if (await refreshInterestingStat(generatedAt)) written += 1
    } catch (err) {
      console.error('[stats-cache] interesting-stat refresh failed (per-town)', err)
    }

    return { written, durationMs: Date.now() - t0 }
  } finally {
    if (trackRefresh) endSqliteRefresh(new Date().toISOString())
    await releaseStatsCacheRebuildLock(lockToken)
  }
}

/** Convenience: rebuild a single town's market stats (+ bundles / All). */
export async function rebuildStatsCacheForTown(
  town: TmreTown,
  options: { trackRefresh?: boolean } = {},
): Promise<RebuildStatsResult> {
  return rebuildStatsCacheForTowns([town], options)
}

/** Rebuild stats cache when missing or older than STATS_CACHE_TTL_MS. */
export async function rebuildStatsCacheIfStale(force = false): Promise<RebuildStatsResult> {
  if (!(await hasLocalListingsCache())) {
    return { written: 0, durationMs: 0, skipped: true }
  }
  if (!force && !isStatsCacheStale() && !(await statsCacheMissingRequiredEntries())) {
    const { statsCacheEntries } = await readListingsDbStats()
    if (statsCacheEntries > 0) {
      return { written: 0, durationMs: 0, skipped: true }
    }
  }
  return rebuildStatsCache()
}

/** Queue a stats cache rebuild without blocking the current request. */
export function scheduleStatsCacheRebuildIfStale(force = false): void {
  if (backgroundRebuildScheduled) return
  backgroundRebuildScheduled = true
  void (async () => {
    try {
      if (!(await hasLocalListingsCache())) return
      if (!force && !isStatsCacheStale() && !(await statsCacheMissingRequiredEntries())) {
        const { statsCacheEntries } = await readListingsDbStats()
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
